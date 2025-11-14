# 多言語RAG統合ガイド

## 概要

日本語で質問 → 英語論文を検索 → 日本語で根拠付き回答を返す、完全ローカル優先の多言語RAGシステムの実装ガイドです。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│               多言語RAGパイプライン                      │
│                                                         │
│  [1] 日本語クエリ                                        │
│       ↓                                                 │
│  [2] 多言語埋め込み (bge-m3, 1024次元)                  │
│       ↓                                                 │
│  [3] ベクトル検索 (pgvector/Qdrant)                     │
│       • 英語論文から TopK=40-50 取得                     │
│       ↓                                                 │
│  [4] 再ランキング (TEI, 多言語対応)                     │
│       • TopN=10-15 に絞り込み                           │
│       ↓                                                 │
│  [5] 遅延翻訳 (Lazy Translation)                        │
│       • 上位チャンクのみ EN→JA                          │
│       • PostgreSQLキャッシュでAPI削減                   │
│       ↓                                                 │
│  [6] LLM生成 (Ollama/OpenAI/Gemini)                    │
│       • 英語原文 + 日本語訳を併記                       │
│       • 日本語で要約・回答生成                          │
│       ↓                                                 │
│  [7] 出力                                               │
│       • 日本語回答 + 英語引用                           │
│       • PDFハイライト (原文ページ)                      │
└─────────────────────────────────────────────────────────┘
```

## 実装済みコンポーネント

### 1. データベーススキーマ

**翻訳キャッシュテーブル** (`rag_translations`)

```sql
CREATE TABLE rag_translations (
  chunk_id   text PRIMARY KEY,      -- rag_docs.chunk_id への外部キー
  lang       text NOT NULL,         -- 'ja', 'en', 'zh', 'ko'
  translated text NOT NULL,         -- 翻訳テキスト
  provider   text,                  -- 'ollama', 'openai', 'gemini'
  model      text,                  -- モデル名
  updated_at timestamptz DEFAULT now()
);
```

**特徴:**
- チャンクIDごとに1つの翻訳をキャッシュ
- プロバイダ・モデル情報を保存（デバッグ用）
- 更新日時で古いキャッシュの無効化が可能

### 2. LLMルーター (`api/app/services/llm_router.py`)

**目的:** 複数のLLMプロバイダを統一インターフェースで利用

**サポート:**
- Ollama (ローカル推奨)
- OpenAI (API)
- Gemini (API)
- Anthropic Claude (API)

**使用例:**
```python
from .services.llm_router import call_text_generation

response = await call_text_generation(
    provider="ollama",
    model="qwen2.5:7b-instruct",
    system="You are a translator",
    user="Hello",
    temperature=0.1,
    max_tokens=512
)
```

### 3. 翻訳サービス (`api/app/services/translate.py`)

**機能:**
- EN→JA: 英語論文を正確な日本語に
- JA→EN: 日本語クエリを英語に (BM25用)
- 要約 (EN→JA): 英語論文の構造化要約

**最適化:**
- 学術論文特化プロンプト
- 専門用語の保持
- 温度0.1で一貫性確保

**使用例:**
```python
from .services.translate import get_translation_service

translator = get_translation_service()

# 英→日
ja_text = await translator.en_to_ja(
    "Zero-shot prompting is a technique..."
)

# 日→英
en_text = await translator.ja_to_en(
    "ゼロショットプロンプトとは..."
)

# 要約生成
summary = await translator.summarize_to_ja(
    "Abstract: This paper presents..."
)
```

### 4. 翻訳キャッシュ (`api/app/services/translation_cache.py`)

**機能:**
- Get: キャッシュから翻訳取得
- Put: 翻訳を保存
- Get Many: バッチ取得
- Put Many: バッチ保存
- Invalidate: キャッシュ無効化
- Stats: 統計情報

**使用例:**
```python
from .services.translation_cache import get_translation_cache

cache = get_translation_cache()

# キャッシュチェック
ja_text = await cache.get(chunk_id="doc_0", lang="ja")

if ja_text is None:
    # キャッシュミス → 翻訳実行
    ja_text = await translator.en_to_ja(original_text)
    await cache.put(
        chunk_id="doc_0",
        lang="ja",
        translated=ja_text,
        provider="ollama",
        model="qwen2.5:7b"
    )
```

## 統合方法

### ステップ1: `/generate` エンドポイント拡張

```python
# api/app/main.py または routes.py

from .services.translate import get_translation_service
from .services.translation_cache import get_translation_cache
import asyncio

@app.post("/generate")
async def generate(req: GenerateRequest):
    translator = get_translation_service()
    cache = get_translation_cache()

    # 1) 検索 (既存フロー)
    candidates = await pg_retriever.search(
        tenant=req.tenant,
        query=req.query,
        top_k=req.top_k or 40
    )

    # 2) 再ランク (既存フロー)
    reranked = await reranker.rank(req.query, candidates, top_n=12)

    # 3) 上位チャンクの遅延翻訳 (新規)
    async def ensure_ja_translation(chunk):
        chunk_id = chunk["chunk_id"]

        # キャッシュチェック
        ja_text = await cache.get(chunk_id, lang="ja")

        if ja_text is None:
            # キャッシュミス → 翻訳実行
            ja_text = await translator.en_to_ja(chunk["content"])
            await cache.put(
                chunk_id=chunk_id,
                lang="ja",
                translated=ja_text,
                provider=translator.provider,
                model=translator.model
            )

        chunk["ja"] = ja_text
        return chunk

    # 並列翻訳
    top_chunks = reranked[:8]
    top_chunks = await asyncio.gather(*[
        ensure_ja_translation(c) for c in top_chunks
    ])

    # 4) コンテキスト構築 (英日併記)
    context = ""
    for i, chunk in enumerate(top_chunks, 1):
        context += f"[{i}] (EN) {chunk['content']}\n"
        context += f"[{i}] (JA) {chunk['ja']}\n"
        context += "--\n"

    # 5) LLM生成 (日本語固定)
    system = (
        "あなたは厳密で簡潔な日本語サイエンスライターです。"
        "引用箇所番号を角括弧で示し、事実以外は書かないでください。"
    )

    prompt = f"質問: {req.query}\n---\n{context}\n---\n日本語で回答してください。"

    answer = await llm_router.generate(
        provider=req.provider or "ollama",
        model=req.model or "qwen2.5:14b-instruct",
        system=system,
        user=prompt,
        temperature=0.2,
        max_tokens=800
    )

    # 6) 引用情報付きで返却
    return {
        "answer": answer,
        "citations": [
            {
                "index": i + 1,
                "title": c["title"],
                "page": c["page"],
                "content_en": c["content"],
                "content_ja": c["ja"],
                "score": c["score"]
            }
            for i, c in enumerate(top_chunks)
        ]
    }
```

### ステップ2: BM25補助検索 (オプション)

日本語クエリを英語に翻訳してBM25検索も実行：

```python
# 日本語クエリ検出
lang = translator.detect_language(req.query)

if lang == "ja":
    # BM25用に英訳
    en_query = await translator.ja_to_en(req.query)
    bm25_results = await bm25_store.search(en_query, tenant=req.tenant, top=20)
else:
    bm25_results = await bm25_store.search(req.query, tenant=req.tenant, top=20)

# ベクトル検索結果とマージ (RRF)
merged = merge_results(vector_results, bm25_results)
```

### ステップ3: UI統合

#### コンポーネント: `LanguageToggle.tsx`

```typescript
// ui/components/LanguageToggle.tsx

interface ChunkDisplay {
  content_en: string;
  content_ja: string;
}

export function LanguageToggle({ chunk }: { chunk: ChunkDisplay }) {
  const [lang, setLang] = useState<'en' | 'ja'>('ja');

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => setLang('en')}
          className={lang === 'en' ? 'active' : ''}
        >
          EN
        </button>
        <button
          onClick={() => setLang('ja')}
          className={lang === 'ja' ? 'active' : ''}
        >
          JA
        </button>
      </div>

      <div className="content">
        {lang === 'en' ? chunk.content_en : chunk.content_ja}
      </div>
    </div>
  );
}
```

#### Debug Panel 拡張

```typescript
// 翻訳メトリクスの追加表示
interface TranslationMetrics {
  cache_hits: number;
  cache_misses: number;
  translation_time_ms: number;
}

// DebugPane内で表示
<div className="translation-metrics">
  <h4>Translation</h4>
  <div>Cache: {metrics.cache_hits} hits, {metrics.cache_misses} misses</div>
  <div>Time: {metrics.translation_time_ms}ms</div>
</div>
```

## 運用のベストプラクティス

### 1. パラメータチューニング

| パラメータ | 推奨値 | 理由 |
|-----------|--------|------|
| **top_k** | 40-50 | 翻訳前に候補を広く取得 |
| **rerank_top** | 10-15 | 翻訳コストとのバランス |
| **translation_temperature** | 0.1 | 一貫性・忠実性重視 |
| **generation_temperature** | 0.2-0.3 | やや創造的だが事実ベース |

### 2. キャッシュ戦略

**キャッシュヒット率向上:**
```python
# 定期的な統計確認
stats = await cache.get_stats()
print(f"Total entries: {stats['total_entries']}")
print(f"By language: {stats['by_language']}")
print(f"Hit rate: {calculate_hit_rate()}%")
```

**古いキャッシュの無効化:**
```python
from datetime import timedelta

# 30日以上古いキャッシュを削除
await cache.invalidate(older_than=timedelta(days=30))
```

### 3. パフォーマンス最適化

**並列翻訳:**
```python
# ❌ 逐次処理 (遅い)
for chunk in chunks:
    chunk["ja"] = await translator.en_to_ja(chunk["content"])

# ✅ 並列処理 (速い)
translations = await asyncio.gather(*[
    translator.en_to_ja(c["content"]) for c in chunks
])
for i, chunk in enumerate(chunks):
    chunk["ja"] = translations[i]
```

**バッチキャッシュ操作:**
```python
# キャッシュチェック (一括)
cached = await cache.get_many([c["chunk_id"] for c in chunks], lang="ja")

# 未キャッシュのみ翻訳
to_translate = [c for c in chunks if c["chunk_id"] not in cached]
translations = await asyncio.gather(*[
    translator.en_to_ja(c["content"]) for c in to_translate
])

# 一括保存
await cache.put_many([
    {
        "chunk_id": chunk["chunk_id"],
        "lang": "ja",
        "translated": trans,
        "provider": "ollama",
        "model": "qwen2.5:7b"
    }
    for chunk, trans in zip(to_translate, translations)
])
```

### 4. モニタリング

**メトリクス:**
- 翻訳時間 (per chunk)
- キャッシュヒット率
- プロバイダ別レイテンシ
- エラー率

**ログ例:**
```
[INFO] translation: en→ja provider=ollama model=qwen2.5:7b chars=450→520 time=1.2s
[INFO] translation_cache: HIT chunk_id=doc_0_3 lang=ja provider=ollama age=2h
[INFO] translation_cache: MISS chunk_id=doc_0_7 lang=ja
```

## トラブルシューティング

### 翻訳品質が低い

**原因:** モデルが学術論文に不慣れ

**対策:**
```python
# プロンプト改善
system = """
You are an expert translator specializing in academic papers.
Preserve:
- Technical terminology (e.g., "zero-shot" → ゼロショット)
- Mathematical notation (keep as-is)
- Citations and references

Translate naturally but accurately.
"""
```

### 翻訳が遅い

**原因:** キャッシュヒット率が低い / プロバイダが遅い

**対策:**
1. キャッシュヒット率確認
2. 並列翻訳の実装確認
3. ローカルモデル (Ollama) への切り替え
4. 軽量モデル (qwen2.5:3b) の検討

### キャッシュが肥大化

**原因:** 古い翻訳が残っている

**対策:**
```bash
# PostgreSQL接続
PGPASSWORD=ragpass psql -h localhost -p 5433 -U rag -d ragdb

-- キャッシュサイズ確認
SELECT
  lang,
  COUNT(*) as entries,
  pg_size_pretty(SUM(length(translated))) as size
FROM rag_translations
GROUP BY lang;

-- 古いエントリ削除
DELETE FROM rag_translations
WHERE updated_at < now() - interval '30 days';

VACUUM ANALYZE rag_translations;
```

## 今後の拡張

### 1. 追加言語サポート

```python
# 中国語、韓国語対応
async def en_to_zh(text: str) -> str:
    return await translator.translate(text, target="zh")

async def en_to_ko(text: str) -> str:
    return await translator.translate(text, target="ko")
```

### 2. 事前翻訳 (オプション)

頻繁にアクセスされるドキュメントは事前翻訳:

```python
# バックグラウンドジョブ
async def precompute_translations(doc_id: str):
    chunks = await db.get_chunks(doc_id)

    for chunk in chunks:
        if not await cache.get(chunk["chunk_id"], "ja"):
            ja = await translator.en_to_ja(chunk["content"])
            await cache.put(chunk["chunk_id"], "ja", ja)
```

### 3. 翻訳品質評価

```python
# BLEU/COMET スコア計算
from sacrebleu import corpus_bleu

references = [...]  # 人手翻訳
hypotheses = [...]  # システム翻訳

score = corpus_bleu(hypotheses, [references])
print(f"BLEU: {score.score}")
```

## リソース

- **BGE-M3モデル:** https://huggingface.co/BAAI/bge-m3
- **Qwen2.5:** https://ollama.com/library/qwen2.5
- **翻訳品質評価:** https://github.com/mjpost/sacrebleu

## まとめ

多言語RAGシステムの基盤は完成しています：

✅ PostgreSQL翻訳キャッシュ
✅ LLMルーター (Ollama/OpenAI/Gemini)
✅ 翻訳サービス (EN↔JA)
✅ 遅延翻訳戦略

残りは `/generate` エンドポイントとUIへの統合のみです！
