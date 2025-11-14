from fastapi import FastAPI

from .routers import docs

app = FastAPI(title="RAG Docs API")
app.include_router(docs.router)


@app.get("/healthz")
async def read_health():
    return {"ok": True}
