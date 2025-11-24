from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence
from urllib.parse import urljoin, urlparse, unquote

import httpx

logger = logging.getLogger(__name__)

_PROPFIND_BODY = """<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getlastmodified/>
    <d:getetag/>
    <d:getcontentlength/>
    <d:getcontenttype/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>
"""


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _maybe_int(value: str | None, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@dataclass(slots=True)
class NextcloudSettings:
    """Configuration for accessing Nextcloud WebDAV."""

    base_url: str
    username: str
    password: str
    rag_folder: str = "/RAG"
    verify_tls: bool = True
    rate_limit_per_min: int = 30
    max_file_bytes: int = 200 * 1024 * 1024
    state_file: Path = Path("data/nextcloud/state.json")
    timeout_seconds: int = 60

    @classmethod
    def from_env(cls) -> NextcloudSettings | None:
        base = os.getenv("NEXTCLOUD_WEBDAV_BASE_URL")
        username = os.getenv("NEXTCLOUD_USERNAME") or os.getenv(
            "NEXTCLOUD_WEBDAV_USERNAME"
        )
        password = os.getenv("NEXTCLOUD_APP_PASSWORD") or os.getenv(
            "NEXTCLOUD_WEBDAV_PASSWORD"
        )
        if not base or not username or not password:
            return None
        rag_folder = os.getenv("NEXTCLOUD_RAG_FOLDER", "/RAG") or "/RAG"
        rag_folder = "/" + rag_folder.strip("/ ")
        verify = _env_bool("NEXTCLOUD_VERIFY_TLS", True)
        rate_limit = _maybe_int(os.getenv("NEXTCLOUD_RATELIMIT_PER_MIN"), 30)
        max_file_bytes = (
            _maybe_int(os.getenv("NEXTCLOUD_MAX_FILE_MB"), 200) * 1024 * 1024
        )
        state_file = Path(
            os.getenv("NEXTCLOUD_STATE_FILE", "data/nextcloud/state.json")
        )
        state_file.parent.mkdir(parents=True, exist_ok=True)
        timeout = _maybe_int(os.getenv("NEXTCLOUD_TIMEOUT_SEC"), 60)
        return cls(
            base.rstrip("/"),
            username,
            password,
            rag_folder,
            verify,
            max(1, rate_limit),
            max(1, max_file_bytes),
            state_file,
            max(10, timeout),
        )


@dataclass(slots=True)
class RagIngestSettings:
    """Configuration for bridging into the RAG backend ingestion endpoint."""

    base_url: str
    api_key: Optional[str]
    tenant: str
    user_id: str
    notebook_id: str
    include_global: bool = False
    verify_tls: bool = True
    timeout_seconds: int = 120
    tags: Sequence[str] = field(default_factory=tuple)

    @classmethod
    def from_env(cls) -> RagIngestSettings:
        base = os.getenv("RAG_INGEST_BASE_URL", "http://rag-backend:8000") or ""
        if not base:
            raise RuntimeError("RAG_INGEST_BASE_URL must be set")
        api_key = os.getenv("RAG_INGEST_API_KEY")
        tenant = os.getenv("RAG_INGEST_TENANT", "demo")
        user_id = os.getenv("RAG_INGEST_USER", "rag-bot")
        notebook_id = os.getenv("RAG_INGEST_NOTEBOOK", "nextcloud-rag")
        include_global = _env_bool("RAG_INGEST_INCLUDE_GLOBAL", False)
        verify = _env_bool("RAG_INGEST_VERIFY_TLS", True)
        timeout = _maybe_int(os.getenv("RAG_INGEST_TIMEOUT_SEC"), 120)
        tags_raw = os.getenv("RAG_INGEST_TAGS", "")
        tags = tuple(filter(None, (tag.strip() for tag in tags_raw.split(","))))
        return cls(
            base.rstrip("/"),
            api_key,
            tenant,
            user_id,
            notebook_id,
            include_global,
            verify,
            max(10, timeout),
            tags,
        )


@dataclass(slots=True)
class NextcloudEntry:
    path: str
    href: str
    is_dir: bool
    etag: Optional[str]
    last_modified: Optional[datetime]
    content_type: Optional[str]
    size: Optional[int]


class SimpleRateLimiter:
    """Coarse per-minute limiter to avoid hammering WebDAV."""

    def __init__(self, limit_per_minute: int) -> None:
        self.limit = max(1, limit_per_minute)
        self._events: deque[float] = deque(maxlen=self.limit)

    async def wait(self) -> None:
        now = time.monotonic()
        window = 60.0
        while self._events and now - self._events[0] > window:
            self._events.popleft()
        if len(self._events) >= self.limit:
            sleep_for = window - (now - self._events[0])
            if sleep_for > 0:
                await asyncio.sleep(sleep_for)
        self._events.append(time.monotonic())


class NextcloudWebDAVClient:
    """Minimal WebDAV client for the specific operations we need."""

    def __init__(self, settings: NextcloudSettings) -> None:
        self.settings = settings
        self._auth = (settings.username, settings.password)
        parsed = urlparse(settings.base_url)
        self._base_path = parsed.path.rstrip("/")

    def _normalize_path(self, path: str) -> str:
        cleaned = "/" + path.strip()
        cleaned = cleaned.replace("//", "/")
        return cleaned

    def normalize_path(self, path: str) -> str:
        return self._normalize_path(path)

    def _build_url(self, path: str) -> str:
        path = self._normalize_path(path)
        return urljoin(f"{self.settings.base_url}/", path.lstrip("/"))

    async def propfind(self, path: str, depth: str = "0") -> List[NextcloudEntry]:
        url = self._build_url(path)
        headers = {"Depth": depth, "Content-Type": "application/xml; charset=utf-8"}
        async with httpx.AsyncClient(
            auth=self._auth,
            verify=self.settings.verify_tls,
            timeout=self.settings.timeout_seconds,
        ) as client:
            resp = await client.request("PROPFIND", url, headers=headers, content=_PROPFIND_BODY)
        if resp.status_code not in (200, 207):
            resp.raise_for_status()
        return self._parse_propfind_response(resp.text)

    async def list_folder(self, path: str) -> List[NextcloudEntry]:
        entries = await self.propfind(path, depth="1")
        normalized = self._normalize_path(path)
        return [entry for entry in entries if entry.path != normalized]

    async def stat(self, path: str) -> Optional[NextcloudEntry]:
        entries = await self.propfind(path, depth="0")
        return entries[0] if entries else None

    async def download(self, path: str) -> tuple[bytes, Optional[str]]:
        url = self._build_url(path)
        async with httpx.AsyncClient(
            auth=self._auth,
            verify=self.settings.verify_tls,
            timeout=self.settings.timeout_seconds,
        ) as client:
            resp = await client.get(url)
        resp.raise_for_status()
        return resp.content, resp.headers.get("content-type")

    def _parse_propfind_response(self, payload: str) -> List[NextcloudEntry]:
        import xml.etree.ElementTree as ET

        ns = {"d": "DAV:"}
        try:
            root = ET.fromstring(payload)
        except ET.ParseError as exc:  # pragma: no cover - network data
            raise RuntimeError(f"Failed to parse WebDAV response: {exc}") from exc

        entries: List[NextcloudEntry] = []
        for response in root.findall("d:response", ns):
            href = response.findtext("d:href", default="", namespaces=ns) or ""
            propstat_nodes = response.findall("d:propstat", ns)
            prop = None
            for node in propstat_nodes:
                status = (node.findtext("d:status", default="", namespaces=ns) or "").strip()
                if status.endswith(" 200 OK"):
                    prop = node.find("d:prop", ns)
                    break
            if prop is None:
                continue
            etag = prop.findtext("d:getetag", default="", namespaces=ns) or None
            if etag:
                etag = etag.strip('"')
            last_modified_raw = prop.findtext("d:getlastmodified", default="", namespaces=ns) or None
            last_modified = None
            if last_modified_raw:
                try:
                    last_modified = parsedate_to_datetime(last_modified_raw)
                except (TypeError, ValueError):  # pragma: no cover - depends on remote server
                    last_modified = None
            content_length = prop.findtext("d:getcontentlength", default="", namespaces=ns) or None
            size = None
            if content_length:
                try:
                    size = int(content_length)
                except (TypeError, ValueError):  # pragma: no cover
                    size = None
            content_type = prop.findtext("d:getcontenttype", default="", namespaces=ns) or None
            resource_type = prop.find("d:resourcetype", ns)
            is_dir = False
            if resource_type is not None:
                is_dir = resource_type.find("d:collection", ns) is not None
            normalized_path = self._normalize_href(href)
            entries.append(
                NextcloudEntry(
                    path=normalized_path,
                    href=href,
                    is_dir=is_dir,
                    etag=etag,
                    last_modified=last_modified,
                    content_type=content_type,
                    size=size,
                )
            )
        return entries

    def _normalize_href(self, href: str) -> str:
        parsed = urlparse(href)
        path = parsed.path
        if not path.startswith("/"):
            path = "/" + path
        if self._base_path and path.startswith(self._base_path):
            path = path[len(self._base_path) :]
            if not path.startswith("/"):
                path = "/" + path
        return unquote(path) or "/"


class NextcloudIngestState:
    """Persists which files have been processed via ETag or mtime fingerprints."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = asyncio.Lock()
        self._data: Dict[str, Dict[str, Any]] = {"files": {}}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            self._data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            logger.warning("Nextcloud ingest state file is corrupted; recreating: %s", self.path)
            self._data = {"files": {}}

    def lookup(self, path: str) -> Optional[Dict[str, Any]]:
        return self._data.get("files", {}).get(path)

    async def update(self, path: str, fingerprint: Dict[str, Any]) -> None:
        async with self._lock:
            files = self._data.setdefault("files", {})
            files[path] = {
                **fingerprint,
                "updated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            }
            tmp_path = self.path.with_suffix(".tmp")
            tmp_path.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp_path.replace(self.path)


class RagIngestClient:
    """Uploads files into the existing RAG ingestion endpoint."""

    def __init__(self, settings: RagIngestSettings) -> None:
        self.settings = settings
        self._headers = {}
        if settings.api_key:
            self._headers = {
                "authorization": f"Bearer {settings.api_key}",
                "x-api-key": settings.api_key,
            }

    async def ingest(
        self,
        *,
        file_name: str,
        content: bytes,
        content_type: Optional[str],
        source_path: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        params = {"tenant": self.settings.tenant}
        fields = {
            "notebook_id": self.settings.notebook_id,
            "user_id": self.settings.user_id,
            "source": "nextcloud",
            "original_path": source_path,
            "include_global": "true" if self.settings.include_global else "false",
        }
        if metadata:
            fields["metadata"] = json.dumps(metadata, ensure_ascii=False)
        if self.settings.tags:
            fields["tags"] = ",".join(self.settings.tags)
        files = {
            "file": (file_name, content, content_type or "application/octet-stream"),
        }
        async with httpx.AsyncClient(
            verify=self.settings.verify_tls,
            timeout=self.settings.timeout_seconds,
        ) as client:
            resp = await client.post(
                f"{self.settings.base_url}/ingest",
                params=params,
                headers=self._headers,
                data=fields,
                files=files,
            )
        resp.raise_for_status()
        try:
            return resp.json()
        except json.JSONDecodeError:
            return {"status": "ok", "raw": resp.text}


class NextcloudIngestManager:
    """Coordinates syncing files from Nextcloud into the RAG ingest endpoint."""

    def __init__(
        self,
        nc_settings: NextcloudSettings,
        rag_settings: RagIngestSettings,
    ) -> None:
        self.settings = nc_settings
        self.nextcloud = NextcloudWebDAVClient(nc_settings)
        self.rag = RagIngestClient(rag_settings)
        self.state = NextcloudIngestState(nc_settings.state_file)
        self.rate_limiter = SimpleRateLimiter(nc_settings.rate_limit_per_min)
        self._tasks: Dict[str, asyncio.Task[Any]] = {}
        self._task_lock = asyncio.Lock()

    def _fingerprint(self, entry: NextcloudEntry) -> Dict[str, Any]:
        return {
            "etag": entry.etag,
            "last_modified": entry.last_modified.isoformat() if entry.last_modified else None,
            "size": entry.size,
        }

    def _within_scope(self, path: str) -> bool:
        normalized = "/" + path.strip("/")
        if normalized == self.settings.rag_folder:
            return True
        return normalized.startswith(self.settings.rag_folder.rstrip("/") + "/")

    def resolve_library_path(self, path: str) -> str:
        normalized = self.nextcloud.normalize_path(path)
        if normalized in ("/", ""):
            normalized = self.settings.rag_folder
        if not self._within_scope(normalized):
            raise ValueError(f"path {normalized} is outside allowed folder {self.settings.rag_folder}")
        return normalized

    async def ingest_by_path(
        self,
        path: str,
        *,
        force: bool = False,
        reason: str = "manual",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        normalized = "/" + path.strip()
        if not self._within_scope(normalized):
            raise ValueError(f"path {normalized} is outside allowed folder {self.settings.rag_folder}")
        await self.rate_limiter.wait()
        entry = await self.nextcloud.stat(normalized)
        if not entry or entry.is_dir:
            raise FileNotFoundError(f"No file at {normalized}")
        fingerprint = self._fingerprint(entry)
        previous = self.state.lookup(entry.path)
        if (
            not force
            and previous
            and previous.get("etag") == fingerprint.get("etag")
            and previous.get("last_modified") == fingerprint.get("last_modified")
            and previous.get("size") == fingerprint.get("size")
        ):
            return {
                "status": "skipped",
                "reason": "already_ingested",
                "path": entry.path,
                "etag": entry.etag,
            }
        if entry.size and entry.size > self.settings.max_file_bytes:
            raise ValueError(
                f"File {entry.path} is larger than allowed max {self.settings.max_file_bytes} bytes"
            )
        payload, content_type = await self.nextcloud.download(entry.path)
        metadata = metadata or {}
        metadata.update(
            {
                "path": entry.path,
                "etag": entry.etag,
                "last_modified": entry.last_modified.isoformat() if entry.last_modified else None,
                "size": entry.size,
                "trigger": reason,
            }
        )
        response = await self.rag.ingest(
            file_name=entry.path.split("/")[-1] or "document",
            content=payload,
            content_type=content_type or entry.content_type,
            source_path=entry.path,
            metadata=metadata,
        )
        await self.state.update(entry.path, fingerprint)
        return {
            "status": "ingested",
            "path": entry.path,
            "etag": entry.etag,
            "response": response,
        }

    async def scan_folder(self, *, folder: Optional[str] = None, force: bool = False) -> Dict[str, Any]:
        target = folder or self.settings.rag_folder
        entries = await self.nextcloud.list_folder(target)
        processed: List[Dict[str, Any]] = []
        for entry in entries:
            if entry.is_dir:
                continue
            try:
                result = await self.ingest_by_path(entry.path, force=force, reason="scan")
            except FileNotFoundError:
                continue
            except Exception as exc:
                logger.warning("Failed to ingest %s: %s", entry.path, exc)
                processed.append(
                    {
                        "status": "error",
                        "path": entry.path,
                        "error": str(exc),
                    }
                )
                continue
            processed.append(result)
        return {
            "folder": target,
            "processed": processed,
        }

    async def schedule_ingest(
        self,
        path: str,
        *,
        reason: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        task_id = os.urandom(8).hex()
        loop = asyncio.get_running_loop()
        task = loop.create_task(
            self.ingest_by_path(path, reason=reason, metadata=metadata or {})
        )

        def _cleanup(task_obj: asyncio.Task[Any]) -> None:
            exc = task_obj.exception()
            if exc:
                logger.error("Nextcloud ingest task %s failed: %s", task_id, exc)
            loop.call_soon_threadsafe(self._remove_task, task_id)

        task.add_done_callback(_cleanup)
        async with self._task_lock:
            self._tasks[task_id] = task
        return {"status": "queued", "task_id": task_id, "path": path}

    def _remove_task(self, task_id: str) -> None:
        self._tasks.pop(task_id, None)

    def pending_tasks(self) -> int:
        return len(self._tasks)


@dataclass(slots=True)
class NextcloudRuntime:
    manager: NextcloudIngestManager
    flow_token: Optional[str]


def build_runtime_from_env() -> Optional[NextcloudRuntime]:
    nc_settings = NextcloudSettings.from_env()
    if not nc_settings:
        return None
    rag_settings = RagIngestSettings.from_env()
    manager = NextcloudIngestManager(nc_settings, rag_settings)
    flow_token = os.getenv("NEXTCLOUD_FLOW_TOKEN") or None
    if flow_token:
        flow_token = flow_token.strip()
    logger.info(
        "Nextcloud webhook enabled for folder %s (state: %s)",
        nc_settings.rag_folder,
        nc_settings.state_file,
    )
    return NextcloudRuntime(manager=manager, flow_token=flow_token)
