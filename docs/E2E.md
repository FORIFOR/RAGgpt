# E2E 手順（PDF投入 → RAG検索/チャット応答）

以下はローカル実行を前提にした最小手順です。Docker が使える場合は「依存ミドルウェアの起動(Docker)」が簡単です。

## 1) 依存ミドルウェアの起動 (Docker)

簡易構成として BM25 は Meilisearch、ベクタは Qdrant を使用します（OpenSearch は重いので省略）。

```
# Qdrant (vector DB)
docker run --rm -p 6333:6333 -v $(pwd)/data/qdrant:/qdrant/storage qdrant/qdrant:v1.8.4

# Meilisearch (lexical/BM25)
docker run --rm -p 7700:7700 getmeili/meilisearch:v1.7 meilisearch --no-analytics true

# (任意) TEI (Text Embeddings Inference)
# docker run --rm -p 8080:80 ghcr.io/huggingface/text-embeddings-inference:cpu-1.5
```

TEI を起動しない場合は、API 側で `OPENAI_API_KEY` を設定して OpenAI 埋め込みにフォールバックします。

## 2) API の起動

```
cd api
cp .env.example .env
# .env を編集: API_KEY, OPENAI_API_KEY などを設定
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

動作確認:

```
curl -s http://localhost:8000/health | jq .
```

## 3) UI の起動

```
cd ui
cp .env.local.example .env.local
# .env.local を編集: NEXT_PUBLIC_API_BASE, NEXT_PUBLIC_API_KEY
npm i
npm run dev
```

ブラウザで `http://localhost:3000/rag` を開きます。

## 4) PDF の取り込み → 検索/チャット

1. 右上「取り込み」で PDF を選択（複数可）
2. 取り込み完了メッセージが出たら、検索欄に質問を入力
3. 「チャット」を押すと回答がストリーム表示されます（根拠は下部に表示）

API キー不一致などで失敗する場合は、UI の `NEXT_PUBLIC_API_KEY` と API の `API_KEY` が一致しているか確認してください。

## 5) ダッシュボード（トップページ）のデータ表示（任意）

API が `UI_DATA_DIR` から読み取ります。`api/.env` で指定（既定 `/data/ui`）。以下のファイルを配置すると自動で反映されます。

```
/data/ui/
  kpi.json         # { asOf, kpi: { income, expense, net, cash, accruedPayables } }
  bs.json          # { asOf, currentAssets, currentLiabilities, LongTermLiabilities, netAssets }
  trend.json       # { asOf, months: [ { month, income, expense, net }, ... ] }
  ledger.json      # [ { date, category, item, amount }, ... ]  # or ledger.ndjson
```

例: `kpi.json`

```
{
  "asOf": "2025-09-30",
  "kpi": {
    "income": 187000000,
    "expense": 137280000,
    "net": 32230000,
    "cash": 49720000,
    "accruedPayables": 17490000
  }
}
```

## トラブルシュート
- 401 Unauthorized: UI/API の API_KEY が不一致。`ui/.env.local` と `api/.env` を再確認。
- Embedding unavailable: TEI 未起動かつ OPENAI_API_KEY 未設定。どちらかを有効化。
- SSE が途切れる: UI の `NEXT_PUBLIC_API_BASE` を `http://localhost:8000` に（Next rewrite 経由でない直接接続）。
- 検索結果が空: インデスト成功したか確認。`/api/ingest` 応答の chunks 数と `/health` を確認。
