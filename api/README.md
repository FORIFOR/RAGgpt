# Lightweight FastAPI service for PDF highlight rectangles

This folder contains a minimal FastAPI application used by the UI to fetch highlight rectangles for PDF files.

## Endpoints

- `GET /docs/{doc_id}/rects?tenant=...&user_id=...&notebook_id=...&include_global=...&terms=<q>&terms=<q2>`
  - Returns, for each matched page, the raw PyMuPDF rectangles (origin = top-left).
  - Even when no matches are found the endpoint responds with `200` and an empty `rects` array so that the UI can fall back to client-side heuristics.

## Storage layout

Set `RAG_DOCS_DIR` to point at the directory that contains your uploaded PDFs (default: `data/docs`). Files are resolved under `RAG_DOCS_DIR/<tenant>/<notebook_id>/`.

## Running locally

```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 3002
```

Ensure `RAG_DOCS_DIR`, `tenant`, `user_id` などが UI から送られる値と一致していることを確認してください。

## 動作確認用 curl（zsh セーフティ）

```bash
DOCID='demo:n_z3KdmRjY:01_prompt_engineering_jpn.pdf'
ENC=$(python3 - <<'PY'
import os, urllib.parse
print(urllib.parse.quote(os.environ['DOCID'], safe=''))
PY
)
curl -s "http://127.0.0.1:3002/docs/${ENC}/rects?tenant=demo&notebook_id=n_z3KdmRjY&page=35&terms=ゼロショット&terms=プロンプト" | jq
```

`rects` が空配列でも HTTP 200 が返り JSON が整形されていれば OK です。
