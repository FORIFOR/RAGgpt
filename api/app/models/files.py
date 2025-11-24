from typing import List, Optional
from pydantic import BaseModel, Field

class FileTags(BaseModel):
    doc_type: Optional[str] = Field(default=None, description="Document type (e.g., Contract, Invoice)")
    topic: Optional[str] = Field(default=None, description="Business topic or domain")
    entity: Optional[str] = Field(default=None, description="Related entity (Client, Project)")
    state: Optional[str] = Field(default=None, description="Document state (Draft, Final)")
    extras: List[str] = Field(default_factory=list, description="Additional tags or keywords")

class FileModel(BaseModel):
    """
    Represents the internal storage model for a file.
    This mirrors the structure in registry.json but with strict typing.
    """
    id: str
    tenant: str
    user_id: str
    scope: str
    folder_path: str
    notebook_id: Optional[str] = None
    original_name: str
    mime_type: str
    size_bytes: int
    storage_path: str
    created_at: str
    updated_at: str
    tags: FileTags = Field(default_factory=FileTags)
