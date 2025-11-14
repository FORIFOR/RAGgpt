# RAGgpt

Production-lean RAG web app implementing robust parsing, hybrid retrieval (Qdrant + Meilisearch BM25), optional reranking, and citation-first answers. UI is Next.js (App Router), API is FastAPI.

> **📖 初めての方は [QUICKSTART.md](./QUICKSTART.md) をご覧ください**

## Quickstart (推奨: Auto-port)

**新しい自動ポート方式で開発:**

```bash
# 1) 自動ポート割り当て + 全サービス起動 + UI開発サーバー
npm run dev:autoport

# ブラウザが自動で開きます
# UI: http://localhost:3000 (または利用可能な次のポート)
# API: http://localhost:8000 (または利用可能な次のポート)
```

**従来のMake方式 (固定ポート):**

```bash
# 1) One-command setup (Homebrew/colima/docker/node/pnpm)
make setup

# 2) Start all services (api/ui/tei/qdrant/meili)
make up

# 3) Meilisearch index settings
make reindex

# 4) (Optional) Seed sample files in docs/samples
make seed

# 5) Open UI
open http://localhost:3000
# -> /rag で PDF 取り込み → 検索 → チャット（SSE, 引用表示）

# Health check
make health
```

## Auto-port Development System

`npm run dev:autoport` は以下を自動で行います:

1. **空きポート自動検出** - ポート3000-3100, 8000-8100の範囲で利用可能ポートを探す
2. **環境変数自動生成** - `.env.runtime` に動的ポート設定を保存
3. **Dockerサービス起動** - API、Qdrant、Meilisearch、Reranker等を起動
4. **ヘルスチェック** - 全サービスの稼働確認
5. **UI開発サーバー起動** - Next.js開発サーバーを動的ポートで起動
6. **ブラウザ自動起動** - UIが準備完了後にブラウザを開く

**停止方法:**
```bash
# Ctrl+C で全サービス停止
# または個別に:
npm run down:autoport
```

**その他のコマンド:**
```bash
npm run dev:autoport:attach  # フォアグラウンド実行
npm run clean:autoport       # データ含めて完全リセット
```

## Features
- Hybrid retrieval: vector (Qdrant) + BM25 (Meilisearch)
- Optional rerank: BAAI/bge-reranker-v2-m3 (TEI)
- Robust parsing: PDF, DOCX, TXT; normalize and chunk (~800 tokens / overlap 160)
- Citation-first answers with SSE streaming
- Tenant-aware storage (per-tenant Qdrant collections, tenant filter for Meilisearch)
- **Auto-port system**: 自動でポート競合を回避して開発環境を構築

## Repo Structure
- `/ui`: Next.js app (App Router)
- `/api`: FastAPI service (uvicorn)
- `/infrastructure`: Docker Compose, Caddyfile, env, scripts
- `/docs`: Architecture, API, Security, Ops, Evaluation, E2E
- `/data/qdrant`: persistence volume

See `/docs/ARCHITECTURE.md` and `/docs/API.md` for details.
