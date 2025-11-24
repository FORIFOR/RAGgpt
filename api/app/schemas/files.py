from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class FileInfo(BaseModel):
    id: str
    tenant: str
    user_id: str
    scope: Literal["personal", "org"]
    folder_path: str
    notebook_id: Optional[str] = None
    original_name: str
    mime_type: str = Field(default="application/octet-stream")
    size_bytes: int
    created_at: datetime
    updated_at: datetime
    tags: Optional[dict] = None

    class Config:
        from_attributes = True


class FileListResponse(BaseModel):
    items: list[FileInfo]
    count: int
