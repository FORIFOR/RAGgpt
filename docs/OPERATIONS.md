# Operations

## Runtime topology

```
Nextcloud AIO (nextcloud-aio-*)  <-- shared docker network 'nextcloud-aio' -->
└── rag-backend (RAGgpt / Local-minutes API)
└── rag-integrator (FastAPI bridge for Nextcloud WebDAV + PDF rects)
└── rag-ui (Next.js)
└── qdrant / meilisearch (retrieval stores)
└── ollama (LLM) / es (Nextcloud FTS) [running already in AIO stack]
```

- `rag-backend` talks to `http://ollama:11434/v1` (shared with Nextcloud Assistant).
- `rag-integrator` exposes `/nextcloud/*` endpoints for Flow webhooks and manual ingestion.
- All services join the external `nextcloud-aio` network so `nextcloud-aio-nextcloud` can also reach `rag-backend`.

## Environment

1. Copy `.env.example` to `.env.runtime`.
2. Set at minimum:
   - `OPENAI_BASE_URL=http://ollama:11434/v1`
   - `OPENAI_API_KEY` (dummy string for Ollama, required by the code path)
   - `NEXTCLOUD_WEBDAV_BASE_URL=https://cloud.example.jp/remote.php/dav/files/rag-bot`
   - `NEXTCLOUD_USERNAME` **or** `NEXTCLOUD_WEBDAV_USERNAME`（どちらもサポート）
   - `NEXTCLOUD_APP_PASSWORD` **or** `NEXTCLOUD_WEBDAV_PASSWORD`
   - `NEXTCLOUD_RAG_FOLDER=/RAG`
   - `RAG_INGEST_BASE_URL=http://rag-backend:8000`
   - `RAG_INGEST_API_KEY`, `RAG_INGEST_TENANT`, `RAG_INGEST_USER`, `RAG_INGEST_NOTEBOOK`
3. Optional toggles:
   - `NEXTCLOUD_VERIFY_TLS`, `NEXTCLOUD_MAX_FILE_MB`, `NEXTCLOUD_STATE_FILE`
   - `NEXTCLOUD_FLOW_TOKEN` → same token as the one configured in Nextcloud Flow `Authorization: Bearer <token>`
   - `RAG_INGEST_TAGS`, `RAG_INGEST_INCLUDE_GLOBAL`, `RAG_INGEST_VERIFY_TLS`

## Services

- Compose file: `docker compose -f infrastructure/docker-compose.nextcloud.yml up -d --build`
  - `rag-backend` build context defaults to `../mcp-rag-server` (override via `RAG_BACKEND_CONTEXT`).
  - `rag-integrator` container exposes port `8000` (webhook endpoint) and persists state under `data/nextcloud/state.json`.
  - `rag-ui` exposes port `3000` (Next.js) and proxies API calls to `rag-backend`.
- Health checks:
  - `curl -fsSL http://localhost:8000/healthz`
  - `curl -fsSL http://localhost:8000/nextcloud/status`

## Nextcloud ingestion

### Manual / batch

- `scripts/nextcloud_ingest.py --folder /RAG` scans the configured folder and uploads any file whose ETag/mtime changed.
- `scripts/nextcloud_ingest.py --path /RAG/foo.pdf` ingests a single file (use `--force` to re-upload despite identical ETag).
- All state (ETag, mtime, last success) is stored at `NEXTCLOUD_STATE_FILE` (default `data/nextcloud/state.json`).

### Flow webhook

1. Flow condition: "ファイルが /RAG に追加されたとき" or "ファイルにタグ RAG が付いたとき".
2. Action: Webhook → `http://rag-integrator:8000/nextcloud/webhook` (inside `nextcloud-aio` network).
3. Headers:
   - `Authorization: Bearer <NEXTCLOUD_FLOW_TOKEN>`
   - `Content-Type: application/json`
4. Payload must contain `path` (e.g. `/RAG/foo.pdf`). The service responds immediately with `{ "status": "queued", "task_id": ... }` while ingestion runs asynchronously.

### RAG backend upload

- The integrator calls `${RAG_INGEST_BASE_URL}/ingest?tenant=${RAG_INGEST_TENANT}`
- Form fields: `notebook_id`, `user_id`, `original_path`, `metadata`, `tags`.
- Please ensure the backend is reachable from the integrator container (DNS `rag-backend` on `nextcloud-aio`).

## Indices / stores

- Qdrant persists to `data/qdrant` (mounted into `rag-qdrant`).
- Meilisearch persists to `data/meili`.
- Elasticsearch (for Nextcloud FTS) runs on the Nextcloud side; configure Nextcloud FTS plugin to point to `http://es:9200`.

## Backups

- Nextcloud AIO already snapshots Nextcloud + MariaDB + Elasticsearch via Borg.
- Add `data/qdrant`, `data/meili`, and (if required) your vector DB directories to Borg.
- The Nextcloud ingest state JSON is reconstructible but can also be included in backups.

## Tuning

- LLM: set `OPENAI_MODEL=qwen2.5:7b-instruct-q4_K_M` (Ollama) or another local model.
- Hybrid retrieval: `HYBRID_ALPHA`, `K1`, `K2`, `TOP`.
- Reranker: set `RERANKER_URL` (shared TEI reranker) and toggle via query `rerank=true`.

## Troubleshooting

- `curl -fsSI http://rag-integrator:8000/nextcloud/status` → verifies env wiring.
- `docker logs rag-integrator` → shows WebDAV / ingest debug logs with context snippet.
- `docker exec -it rag-integrator bash -lc 'ls -al data/nextcloud'` → ensure state path writable.
