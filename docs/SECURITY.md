# Security

- API Key: All endpoints (except /health) require `x-api-key`.
- CORS: UI localhost origins allowed in dev; restrict in production via reverse proxy.
- Uploads: MIME allowlist and max size via env vars; content is processed in-memory and not persisted.
- Logging: Only meta if added; no file contents or queries stored server-side beyond vector/BM25 indices.
- Dependencies: Docker Compose services use latest stable images; security plugin disabled for local OpenSearch.

