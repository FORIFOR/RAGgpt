# Architecture

- UI: Next.js (App Router). Two-pane layout with upload/search top bar, streaming chat with citations panel.
- API: FastAPI. Endpoints: /ingest (multipart), /search (JSON), /chat (SSE), /health.
- Embedding: TEI (BAAI/bge-m3) over HTTP.
- Vector DB: Qdrant (per-tenant collections) with cosine distance.
- BM25: OpenSearch with kuromoji analyzer for Japanese; same metadata stored as payload.
- Optional rerank: TEI rerank (BAAI/bge-reranker-v2-m3) ON/OFF.

Data model
- documents: id, tenant_id, title, source_uri, mime, lang, created_at
- chunks: id, doc_id, tenant_id, content, tokens, page, section, title, hash
- Qdrant payload stores chunk metadata; OpenSearch document mirrors same metadata.

Ingest pipeline
1) Parse (PDF/DOCX/TXT) -> texts with page/section
2) Normalize -> remove extra spaces/newlines
3) Chunk (~800 tokens / overlap 160)
4) Embed (TEI)
5) Upsert (Qdrant + OpenSearch)
6) Idempotent via content+page+section hash as chunk id

Retrieval
1) Embed query
2) Qdrant vector search (K1)
3) OpenSearch BM25 (K2)
4) Merge + dedupe
5) Score = α*norm(vec) + (1-α)*norm(bm25)
6) Top N (default 8)
7) Optional rerank to top 3

Generation
- Build strict system prompt and context blocks (title/page/section/uri).
- Stream via OpenAI/Azure streaming Chat Completions.
- SSE framing: token events then done with citations array.

