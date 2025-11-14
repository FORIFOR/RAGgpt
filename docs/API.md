# API

Base URL: `${NEXT_PUBLIC_API_BASE}` (default `http://localhost:8000`). Requires header `x-api-key`.

## Health
- `GET /health` -> 200 JSON on success, checks Qdrant/TEI/OpenSearch.

## Ingest
- `POST /ingest?tenant=default` (multipart)
  - Form: `files[]` multiple
  - Allowed MIME: pdf, txt, docx
  - Response: `{ documents: [{doc_id, title, chunks}] }`

Example
```bash
curl -X POST "http://localhost:8000/ingest?tenant=default" \
  -H 'x-api-key: dev-secret-change-me' \
  -F 'files=@/path/to/file.pdf'
```

## Search
- `POST /search`
  - Body: `{ query, k?, tenant?, rerank? }`
  - Response: `{ candidates: [ {title, page, section, source_uri, content, hybrid_score, ...} ] }`

## Chat (SSE)
- `POST /chat`
  - Body: `{ query, k?, stream?, tenant?, rerank? }`
  - Response: `text/event-stream`
  - Frames:
    - `data: {"type":"token","text":"..."}` repeated
    - `data: {"type":"done","citations":[{title,page,section,uri},...]}` once at end

OpenAPI spec is exported at runtime to `/api/openapi.yaml` (container path `/app/openapi.yaml`).

