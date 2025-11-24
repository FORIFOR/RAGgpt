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

## Nextcloud WebDAV 設定

Nextcloud の WebDAV にファイルを上げたり `/RAG` フォルダを Notebook に紐付けるためには、API と Next.js の両方で同じ環境変数を用意する必要があります。下記のキーを `.env.runtime`（`npm run dev:autoport` や docker compose 用）および `ui/.env.local`（Next.js）に設定し、本番でも Render / Cloudflare 等のダッシュボードで同じキーを登録してください。

### 必須環境変数

| 変数 | 説明 |
| --- | --- |
| `NEXTCLOUD_WEBDAV_BASE_URL` | `https://cloud.example.com/remote.php/dav/files/<user>/` 形式の WebDAV ベース URL（末尾 `/` 可）。 |
| `NEXTCLOUD_USERNAME` **or** `NEXTCLOUD_WEBDAV_USERNAME` | WebDAV 用の Nextcloud ユーザー名。どちらのキーでも読み取れます。 |
| `NEXTCLOUD_APP_PASSWORD` **or** `NEXTCLOUD_WEBDAV_PASSWORD` | 上記ユーザーのアプリパスワード（Nextcloud → 設定 → セキュリティ → デバイスとセッションで発行）。 |

よく使うオプション:

- `NEXTCLOUD_RAG_FOLDER` … Notebook ごとの既定ルート（例 `/RAG`）
- `NEXTCLOUD_PUBLIC_BASE_URL` … UI から Nextcloud Files に遷移する際のベース URL
- `NEXTCLOUD_TIMEOUT_MS` / `NEXTCLOUD_VERIFY_TLS` … WebDAV リクエストのタイムアウト / TLS 検証

### ローカル開発 (.env.runtime / ui/.env.local)

1. `cp .env.example .env.runtime` を実行して API/Integrations 用の設定ファイルを作成。
2. `ui/.env.local` を作成し、同じ `NEXTCLOUD_*` キーを記入（UI 用には公開値が必要なものだけ `NEXT_PUBLIC_` で始める）。
3. `npm run dev:autoport` または `docker compose -f infrastructure/docker-compose.nextcloud.yml up -d --build` を実行。
4. `curl -fsSL http://localhost:3000/api/backend/nextcloud/status | jq` で Next.js 側の設定状況を確認。`ok: true` になれば完了です。

### 本番環境での設定例

- **Render**: 対象サービス（FastAPI / Next.js）の “Environment → Environment Variables” に上記キーを追加し、再デプロイします。Backend と UI の両方に同じ値を入れてください。
- **Cloudflare Pages / Workers**: プロジェクト設定の “Environment variables” で `NEXTCLOUD_*` を追加します。Workers の場合は `env.NEXTCLOUD_WEBDAV_BASE_URL` などが参照されるため、Next.js 側で `process.env` を通じてアクセスできるよう `NEXT_PUBLIC_NEXTCLOUD_*` が必要な値だけ追加してください。

環境変数が未設定の場合、`/api/backend/nextcloud/status` は `ok: false` を返し、UI のアップロードや Nextcloud 連携ボタンは自動で無効化され「Nextcloud が未設定です」とユーザーに案内します。設定後にサーバーを再起動すれば、追加のコード変更なしで連携が有効になります。

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

## Nextcloud連携

Nextcloud Hub (AIO) + Ollama + Elasticsearch をすでに運用している環境と統合するための手順は [`docs/NEXTCLOUD_INTEGRATION.md`](./docs/NEXTCLOUD_INTEGRATION.md) を参照してください。Dockerネットワークを `nextcloud-aio` で共有し、`rag-integrator` の `/nextcloud/webhook` へ Flow から通知することで `/RAG` フォルダの更新が即座に RAG インデックスへ反映されます。
