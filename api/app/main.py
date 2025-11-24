from fastapi import FastAPI

from .routers import docs, files, nextcloud

app = FastAPI(title="RAG Docs API")
app.include_router(docs.router)
app.include_router(files.router)
app.include_router(nextcloud.router)


@app.get("/healthz")
async def read_health():
    return {"ok": True}
