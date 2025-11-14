"""FastAPI entrypoint exposing the highlight rects endpoints."""

from api.app.main import app  # re-export for uvicorn

__all__ = ["app"]
