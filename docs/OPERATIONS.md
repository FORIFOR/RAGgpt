# Operations

## Environment
- Configure `infrastructure/.env` from `env.example`.
- Keys: `OPENAI_API_KEY` or Azure OpenAI variables.

## Services
- `docker compose -f infrastructure/docker-compose.yml up -d --build`
- Health: `GET /api/health`

## Indices
- Initialize OpenSearch: `bash infrastructure/scripts/create_indices.sh`
- Qdrant collections created per-tenant automatically on ingest.

## Backups
- Qdrant persists to `data/qdrant` volume.
- OpenSearch single-node, no replicas in dev.

## Tuning
- `HYBRID_ALPHA`, `HYBRID_K1/K2`, `HYBRID_TOP` for retrieval mix.
- Reranker: set `RERANKER_URL` and toggle per-request with `rerank=true`.

