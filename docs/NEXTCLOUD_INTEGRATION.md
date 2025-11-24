# Nextcloud Integration Guide

このドキュメントでは、Nextcloud Hub（AIO）と RAGgpt/Local-minutes スタックを 1 台のサーバー上で統合し、「/RAG」フォルダに置いたファイルを自動で RAG インデックスへ連携する手順をまとめます。

## 0. Nextcloud 用環境変数を設定する

RAG UI / API / rag-integrator は同じ WebDAV 認証情報を参照します。以下のキーを `.env.runtime`（docker compose や `npm run dev:autoport` が読むファイル）と `ui/.env.local`（Next.js 用）へ設定し、本番では Render や Cloudflare の Environment Variables にも同じ値を登録してください。

| キー | 説明 |
| --- | --- |
| `NEXTCLOUD_WEBDAV_BASE_URL` | `https://cloud.example.com/remote.php/dav/files/<user>/` のような WebDAV ルート URL |
| `NEXTCLOUD_USERNAME` **or** `NEXTCLOUD_WEBDAV_USERNAME` | WebDAV にアクセスする Nextcloud ユーザー名 |
| `NEXTCLOUD_APP_PASSWORD` **or** `NEXTCLOUD_WEBDAV_PASSWORD` | 上記ユーザーのアプリパスワード（Nextcloud → 設定 → セキュリティで発行） |
| `NEXTCLOUD_RAG_FOLDER` | Notebook をどのフォルダに束ねるか（既定 `/RAG`） |
| `NEXTCLOUD_PUBLIC_BASE_URL`（任意） | UI から Nextcloud Files を開くときの URL |

UI ではこれらが欠けていると `/api/backend/nextcloud/status` が `ok: false` を返し、アップロードボタンが自動的に非活性になります。設定後に `curl -fsSL http://localhost:3000/api/backend/nextcloud/status | jq` を実行し `ok: true` になることを確認してください。

## 1. Docker ネットワークを共通化する

1. Nextcloud AIO が作成する `nextcloud-aio` ネットワークを確認:
   ```bash
   docker network ls | grep nextcloud-aio
   ```
2. RAG スタックの Compose も `nextcloud-aio` に参加させます。`infrastructure/docker-compose.nextcloud.yml` ではすでに以下のように指定済みです:
   ```yaml
   services:
     rag-backend:
       networks:
         - ragstack
         - nextcloud-aio
     rag-integrator:
       networks:
         - ragstack
         - nextcloud-aio
   networks:
     nextcloud-aio:
       external: true
   ```
3. これにより次が可能になります:
   - `rag-backend` → `http://ollama:11434/v1`（Nextcloud側の Ollama コンテナ）へ直接アクセス
   - Nextcloud の `nextcloud-aio-nextcloud` → `http://rag-backend:8000` へ API 呼び出し（将来的な Context Agent 連携用）

## 2. LLM を Ollama に統一する

`.env.runtime` の LLM 関連を以下のように設定してください（既定値として `.env.example` も更新済み）。

```dotenv
OPENAI_BASE_URL=http://ollama:11434/v1
OPENAI_API_KEY=dummy   # Ollamaはトークン不要だがコード上必須なら任意文字列
OPENAI_MODEL=qwen2.5:7b-instruct-q4_K_M
```

Nextcloud Assistant も RAGgpt も同じ `Ollama` URL を参照することで、1 台の GPU/CPU に負荷を集約できます。

## 3. Nextcloud → RAG インデックスのパイプライン

### 3-1. WebDAV 経由でファイルを取得

`NEXTCLOUD_WEBDAV_BASE_URL` (例: `https://cloud.example.jp/remote.php/dav/files/rag-bot`) を指定すると、`rag-integrator` サービスが WebDAV からファイル一覧と ETag/mtime を取得します。

- CLI バッチ: `scripts/nextcloud_ingest.py --folder /RAG`
- API: `POST http://rag-integrator:8000/nextcloud/scan`

ETag が変わったファイルだけを `RAG_INGEST_BASE_URL`（既定 `http://rag-backend:8000`）の `/ingest` エンドポイントへ転送します。送信するメタデータ:

```json
{
  "original_path": "/RAG/AI戦略.pdf",
  "metadata": {
    "path": "/RAG/AI戦略.pdf",
    "etag": "abc123",
    "size": 1048576,
    "last_modified": "2025-01-31T02:15:00Z",
    "trigger": "flow"
  },
  "tags": "nextcloud,RAG"
}
```

### 3-2. Nextcloud Flow の Webhook

1. Flow 条件: 「フォルダ `/RAG` にファイルが追加されたとき」など。
2. Flow アクション: Webhook → `http://rag-integrator:8000/nextcloud/webhook`
3. ヘッダ: `Authorization: Bearer <NEXTCLOUD_FLOW_TOKEN>`
4. ペイロード例:
   ```json
   {
     "flow_id": "12345",
     "user": "rag-bot",
     "path": "/RAG/AI戦略.pdf"
   }
   ```
5. 応答: `{ "status": "queued", "task_id": "...", "path": "/RAG/AI戦略.pdf" }`

実際のダウンロードとインデックス投入はバックグラウンド task で処理され、結果は `docker logs rag-integrator` で確認できます。

## 4. Nextcloud Assistant と RAGgpt の住み分け

- **Nextcloud Assistant / Context Agent**
  - Nextcloud UI 上のライトな要約や翻訳
  - バックエンド: `ollama`、検索: Nextcloud FTS (Elasticsearch)
- **RAGgpt / Local-minutes**
  - NotebookLM 的なマルチドキュメント RAG
  - 同じ Ollama / Meilisearch / Qdrant を利用

必要に応じて、RAGgpt の回答を Nextcloud ノートに書き戻す API なども追加できますが、まずは検索系を共有するだけで十分運用可能です。

## 5. バックアップ指針

- Nextcloud AIO + Borg → Nextcloud本体 + DB + Elasticsearch をまるごとスナップショット
- RAGgpt 側:
  - ソースコード → Git
  - Qdrant/Meilisearch データ → `data/qdrant`, `data/meili` を Borg 対象に追加するか、再インデックス可能と割り切る
  - Nextcloud インデックス state (`data/nextcloud/state.json`) は再生成可能だが、含めておくと復旧が容易

## 6. 動作確認の流れ

1. `docker compose -f infrastructure/docker-compose.nextcloud.yml up -d`
2. `curl -fsSL http://localhost:8000/nextcloud/status | jq`
3. `scripts/nextcloud_ingest.py --path /RAG/sample.pdf`
4. RAG UI から該当ファイルが検索候補になっているか確認
5. Flow で `/RAG` に新規ファイルを追加 → 1-2 分以内に RAGgpt 上で検索可能になることを確認

これで Nextcloud をファイル正本、RAGgpt を賢い検索／要約のフロントとして一体運用できます。
