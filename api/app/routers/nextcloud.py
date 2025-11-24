from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from httpx import HTTPStatusError
from pydantic import BaseModel, ConfigDict, Field

from ..integrations.nextcloud import NextcloudRuntime, build_runtime_from_env

router = APIRouter(prefix="/nextcloud", tags=["nextcloud"])

_runtime = build_runtime_from_env()


def _require_runtime() -> NextcloudRuntime:
    if _runtime is None:
        raise HTTPException(
            status_code=503,
            detail="Nextcloud integration is disabled. Set NEXTCLOUD_WEBDAV_* env vars.",
        )
    return _runtime


class FlowPayload(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    flow_id: Optional[str] = Field(default=None, alias="flowId")
    event: Optional[str] = None
    path: Optional[str] = None
    relative_path: Optional[str] = Field(default=None, alias="relativePath")
    file_path: Optional[str] = Field(default=None, alias="filePath")
    file_id: Optional[str] = Field(default=None, alias="fileId")
    user: Optional[str] = None
    token: Optional[str] = None

    def resolve_path(self) -> Optional[str]:
        for candidate in (self.path, self.file_path, self.relative_path):
            if candidate:
                return candidate
        extra_path = self.model_extra.get("path") if self.model_extra else None
        if isinstance(extra_path, str):
            return extra_path
        return None

    def as_metadata(self) -> Dict[str, Any]:
        data = self.model_dump(exclude_none=True)
        return data


class ManualIngestRequest(BaseModel):
    path: str
    force: bool = False


class ScanRequest(BaseModel):
    folder: Optional[str] = None
    force: bool = False


@router.get("/status")
async def nextcloud_status(runtime: NextcloudRuntime = Depends(_require_runtime)) -> Dict[str, Any]:
    return {
        "folder": runtime.manager.settings.rag_folder,
        "state_file": str(runtime.manager.settings.state_file),
        "pending_tasks": runtime.manager.pending_tasks(),
        "flow_token": bool(runtime.flow_token),
    }


@router.get("/browse")
async def nextcloud_browse(
    path: str = Query("/"),
    runtime: NextcloudRuntime = Depends(_require_runtime),
) -> Dict[str, Any]:
    try:
        normalized = runtime.manager.resolve_library_path(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": "path_out_of_scope", "detail": str(exc)}) from exc
    try:
        entries = await runtime.manager.nextcloud.list_folder(normalized)
    except HTTPStatusError as exc:  # pragma: no cover - depends on remote server
        status_code = exc.response.status_code
        payload_text = exc.response.text
        if status_code == 404:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "nextcloud_folder_not_found",
                    "detail": f"Nextcloud フォルダ '{normalized}' が見つかりません。Nextcloud 上で作成するか NEXTCLOUD_RAG_FOLDER を見直してください。",
                },
            ) from exc
        raise HTTPException(
            status_code=status_code,
            detail={"error": "browse_failed", "detail": payload_text or str(exc)},
        ) from exc
    except Exception as exc:  # pragma: no cover - depends on remote server
        raise HTTPException(status_code=502, detail={"error": "browse_failed", "detail": str(exc)}) from exc

    def _entry_dict(entry) -> Dict[str, Any]:
        name = entry.path.rstrip("/").split("/")[-1] or "/"
        last_modified = int(entry.last_modified.timestamp() * 1000) if entry.last_modified else None
        return {
            "path": entry.path,
            "name": name,
            "isFolder": entry.is_dir,
            "size": entry.size,
            "etag": entry.etag,
            "contentType": entry.content_type,
            "lastModified": last_modified,
        }

    return {"path": normalized, "entries": [_entry_dict(entry) for entry in entries]}


@router.post("/webhook")
async def nextcloud_webhook(
    payload: FlowPayload,
    authorization: Optional[str] = Header(default=None),
    runtime: NextcloudRuntime = Depends(_require_runtime),
) -> Dict[str, Any]:
    path = payload.resolve_path()
    if runtime.flow_token:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing Nextcloud Flow token")
        token = authorization.split(" ", 1)[1].strip()
        if token != runtime.flow_token:
            raise HTTPException(status_code=401, detail="Invalid Nextcloud Flow token")
    if not path:
        raise HTTPException(status_code=400, detail="Path missing in webhook payload")
    metadata = {"flow_event": payload.as_metadata()}
    result = await runtime.manager.schedule_ingest(path, reason="flow", metadata=metadata)
    return result


@router.post("/ingest")
async def manual_ingest(
    request: ManualIngestRequest,
    runtime: NextcloudRuntime = Depends(_require_runtime),
) -> Dict[str, Any]:
    try:
        result = await runtime.manager.ingest_by_path(
            request.path,
            force=request.force,
            reason="manual",
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return result


@router.post("/scan")
async def scan_folder(
    request: ScanRequest,
    runtime: NextcloudRuntime = Depends(_require_runtime),
) -> Dict[str, Any]:
    try:
        return await runtime.manager.scan_folder(folder=request.folder, force=request.force)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
