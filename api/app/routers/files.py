from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import List, Literal, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from ..integrations.nextcloud import RagIngestSettings
from ..schemas.files import FileInfo, FileListResponse
from ..services import file_storage
from ..services.extraction import extract_text_from_file
from ..services.llm import LLMService

router = APIRouter(prefix="/files", tags=["files"])


def _normalize_scope(value: str) -> Literal["personal", "org"]:
    normalized = value.strip().lower()
    if normalized not in {"personal", "org"}:
        raise HTTPException(status_code=400, detail="scope must be either 'personal' or 'org'")
    return normalized  # type: ignore


def _clean_folder_path(value: str) -> str:
    cleaned = value.strip()
    if not cleaned.startswith("/"):
        cleaned = f"/{cleaned}"
    cleaned = cleaned.replace("//", "/")
    return cleaned or "/"


@router.post("/", response_model=FileInfo)
async def upload_file(
    file: UploadFile = File(...),
    tenant: str = Form(...),
    user_id: str = Form(...),
    scope: str = Form("personal"),
    folder_path: str = Form("/"),
    notebook_id: Optional[str] = Form(default=None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    storage_path = file_storage.store_bytes(payload, suffix=Path(file.filename or "").suffix)
    metadata = file_storage.create_metadata(
        tenant=tenant.strip() or "default",
        user_id=user_id.strip() or "local",
        scope=_normalize_scope(scope),
        folder_path=_clean_folder_path(folder_path),
        notebook_id=notebook_id.strip() if notebook_id else None,
        original_name=file.filename or "uploaded-file",
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(payload),
        storage_path=storage_path,
    )
    stored = file_storage.register_file(metadata)
    
    background_tasks.add_task(process_file_upload, stored["id"], storage_path, file.filename or "unknown")
    
    return _to_file_info(stored)


async def process_file_upload(file_id: str, file_path: Path, filename: str):
    """
    Background task to extract text and classify the file.
    """
    try:
        # 1. Extract text
        text = extract_text_from_file(file_path)
        if not text:
            print(f"No text extracted from {filename}")
            return

        # 2. Classify with LLM
        llm_service = LLMService()
        tags = await llm_service.classify_document(text, filename)
        
        # 3. Update metadata
        file_storage.update_file_metadata(file_id, tags=tags.dict())
        print(f"File {file_id} tagged: {tags}")
        
    except Exception as e:
        print(f"Error processing file upload for {file_id}: {e}")


@router.get("/", response_model=FileListResponse)
async def list_files(
    tenant: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    folder_path: Optional[str] = Query(default=None),
    doc_type: Optional[str] = Query(default=None),
    topic: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
):
    records = file_storage.list_files(
        tenant=tenant, 
        user_id=user_id, 
        folder_path=folder_path,
        doc_type=doc_type,
        topic=topic,
        state=state
    )
    return FileListResponse(items=[_to_file_info(item) for item in records], count=len(records))


@router.get("/folders")
async def list_folders(
    tenant: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
):
    folders = file_storage.list_folders(tenant=tenant, user_id=user_id)
    return {"folders": folders}


@router.get("/{file_id}", response_model=FileInfo)
async def get_file_info(file_id: str):
    record = file_storage.get_file(file_id)
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    return _to_file_info(record)


@router.get("/{file_id}/download")
async def download_file(file_id: str):
    record = file_storage.get_file(file_id)
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    storage_path = Path(record["storage_path"])
    return FileResponse(
        storage_path,
        media_type=record.get("mime_type") or "application/octet-stream",
        filename=record.get("original_name") or "download",
    )


class LinkRequest(BaseModel):
    tenant: str
    user_id: str
    notebook_id: str
    item_ids: List[str] = Field(default_factory=list)
    include_global: bool = False


@router.post("/link")
async def link_files(payload: LinkRequest):
    if not payload.item_ids:
        raise HTTPException(status_code=422, detail="item_ids must not be empty")

    settings = RagIngestSettings.from_env()
    tenant = payload.tenant.strip() or settings.tenant
    user_id = payload.user_id.strip() or settings.user_id
    notebook_id = payload.notebook_id.strip() or settings.notebook_id
    headers = {}
    if settings.api_key:
        headers = {
            "authorization": f"Bearer {settings.api_key}",
            "x-api-key": settings.api_key,
        }

    successes: List[dict] = []
    errors: List[dict] = []

    async with httpx.AsyncClient(verify=settings.verify_tls, timeout=settings.timeout_seconds) as client:
        for file_id in payload.item_ids:
            record = file_storage.get_file(file_id)
            if not record:
                errors.append({"id": file_id, "error": "not_found"})
                continue
            storage_path = Path(record.get("storage_path", ""))
            try:
                content = storage_path.read_bytes()
            except Exception as exc:
                errors.append({"id": file_id, "error": f"read_failed: {exc}"})
                continue

            metadata = {
                "file_id": file_id,
                "folder_path": record.get("folder_path"),
                "uploaded_at": record.get("created_at"),
            }
            data = {
                "notebook_id": notebook_id,
                "user_id": user_id,
                "source": "library-upload",
                "original_path": f"{record.get('folder_path', '/')}/{record.get('original_name', '')}",
                "include_global": "true" if payload.include_global else "false",
                "metadata": json.dumps(metadata, ensure_ascii=False),
            }
            files = {
                "file": (
                    record.get("original_name") or "file",
                    content,
                    record.get("mime_type") or "application/octet-stream",
                )
            }
            try:
                resp = await client.post(
                    f"{settings.base_url}/ingest",
                    params={"tenant": tenant},
                    headers=headers,
                    data=data,
                    files=files,
                )
                resp.raise_for_status()
                try:
                    ingest_result = resp.json()
                except json.JSONDecodeError:
                    ingest_result = {"status": "ok"}
                successes.append({"id": file_id, "ingest": ingest_result})
                file_storage.update_file_metadata(file_id, notebook_id=notebook_id)
            except Exception as exc:
                errors.append({"id": file_id, "error": str(exc)})

    if not successes and errors:
        raise HTTPException(status_code=502, detail={"error": "link_failed", "detail": errors})
    return {"linked": successes, "errors": errors}


def _to_file_info(record: dict) -> FileInfo:
    created_at = record.get("created_at")
    updated_at = record.get("updated_at") or created_at
    return FileInfo(
        id=record["id"],
        tenant=record.get("tenant", "default"),
        user_id=record.get("user_id", "local"),
        scope=record.get("scope", "personal"),
        folder_path=record.get("folder_path", "/"),
        notebook_id=record.get("notebook_id") or None,
        original_name=record.get("original_name", "uploaded-file"),
        mime_type=record.get("mime_type", "application/octet-stream"),
        size_bytes=int(record.get("size_bytes", 0)),
        created_at=datetime.fromisoformat(created_at) if isinstance(created_at, str) else datetime.utcnow(),
        updated_at=datetime.fromisoformat(updated_at) if isinstance(updated_at, str) else datetime.utcnow(),
        tags=record.get("tags"),
    )
