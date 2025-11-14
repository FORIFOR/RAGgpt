# UI統合ガイド - RAGgpt SSE対応

## 概要

`npm run dev:autoport` で起動したバックエンドに対して、フロントエンド（Next.js UI）から `/generate` エンドポイントを正しく呼び出すためのガイドです。

**要点:**
- `/generate` は **SSE（Server-Sent Events）固定**
- ペイロードのキー名は **`top_k` / `use_rerank`** に統一（`/search` の `k` / `rerank` とは異なる）
- ブラウザから直接 fetch する場合は `ReadableStream` でパース
- プロキシ経由でAPIキーを隠すことも可能

---

## ✅ 必須チェックリスト

### 1. 環境変数（UI側）

**ファイル:** `ui/.env.local`（または `dev:autoport` が生成するUI用env）

```bash
NEXT_PUBLIC_RAG_API_URL=http://localhost:8001
NEXT_PUBLIC_API_KEY=ollama-compatible
```

**注意:**
- `dev:autoport` を使う場合、`sync-ports.sh` の結果に合わせて `8001` を使用
- ポートがズレている場合は `eval "$(bash infrastructure/scripts/sync-ports.sh)"` で同期

### 2. リクエストのキー名

`/generate` エンドポイントは以下のキー名を使用します:

| キー | 型 | 説明 | デフォルト |
|------|-----|------|-----------|
| `query` | string | 必須。ユーザーの質問 | - |
| `tenant` | string | テナントID | `"demo"` |
| `top_k` | integer | 検索件数（**`k`ではない**） | 5 |
| `use_rerank` | boolean | Rerank使用（**`rerank`ではない**） | `true` |
| `strict_rag` | boolean | 根拠なし時に生成を抑制 | `false` |
| `alpha` | float | ハイブリッド結合重み（0.0-1.0） | 0.6 |
| `history` | array | チャット履歴 | `[]` |

**重要:** `/search` では `k` / `rerank` を使いますが、`/generate` では `top_k` / `use_rerank` です。

### 3. SSEで受信する

UIは SSE（`text/event-stream`）をパースして以下を扱います:

| イベントタイプ | 内容 | 処理 |
|--------------|------|------|
| **トークン** | `.text` / `.delta` / `.answer` / `.content` | 回答文字列に追記 |
| **ステータス** | `{type:"status", phase:"retrieval"\|"generation_start"}` | フェーズ表示を更新 |
| **最終メタ** | `{citations: [...], sources: [...]}` | 出典情報を保存 |
| **非JSONトークン** | 素の文字列行 | そのまま追記 |

---

## 🔧 フロント実装スニペット（ブラウザ直 fetch 版）

### lib/rag.ts

```typescript
// lib/rag.ts
export async function* streamGenerate(params: {
  query: string;
  tenant?: string;
  top_k?: number;
  use_rerank?: boolean;
  strict_rag?: boolean;
  alpha?: number;
  history?: Array<{ role: string; content: string }>;
}) {
  const API_BASE = process.env.NEXT_PUBLIC_RAG_API_URL!;
  const API_KEY = process.env.NEXT_PUBLIC_API_KEY!;

  const body = JSON.stringify({
    tenant: params.tenant ?? "demo",
    query: params.query,
    top_k: params.top_k ?? 5,
    use_rerank: params.use_rerank ?? true,
    strict_rag: params.strict_rag ?? false,
    alpha: params.alpha ?? 0.6,
    history: params.history ?? [],
  });

  const res = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body,
  });

  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (!data) continue; // heartbeat

      try {
        const obj = JSON.parse(data);

        // トークン
        const token = obj.text ?? obj.delta ?? obj.answer ?? obj.content ?? "";
        if (token) {
          yield { type: "token" as const, token };
        }

        // ステータス
        if (obj.type === "status") {
          yield { type: "status" as const, phase: obj.phase };
        }

        // 最終メタデータ（出典）
        if (obj.citations || obj.sources) {
          yield {
            type: "final" as const,
            citations: obj.citations ?? [],
            sources: obj.sources ?? [],
          };
        }
      } catch {
        // 非JSONの素トークン行にも対応
        yield { type: "token" as const, token: data };
      }
    }
  }
}
```

### components/RagChat.tsx

```typescript
// components/RagChat.tsx
"use client";
import { useState } from "react";
import { streamGenerate } from "@/lib/rag";

export default function RagChat({ initialQuery = "" }) {
  const [query, setQuery] = useState(initialQuery);
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);

  const onAsk = async () => {
    setAnswer("");
    setCitations([]);
    setIsLoading(true);
    setPhase(null);

    try {
      for await (const ev of streamGenerate({
        query,
        tenant: "demo",
        top_k: 5,
        use_rerank: true,
      })) {
        if (ev.type === "token") {
          setAnswer((s) => s + ev.token);
        }
        if (ev.type === "status") {
          setPhase(ev.phase ?? null);
        }
        if (ev.type === "final") {
          setCitations(ev.citations || []);
        }
      }
    } catch (error) {
      console.error("Generation error:", error);
      setAnswer("エラーが発生しました。");
    } finally {
      setIsLoading(false);
      setPhase(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="border rounded px-3 py-2 flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="質問を入力…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onAsk();
            }
          }}
        />
        <button
          onClick={onAsk}
          disabled={isLoading || !query.trim()}
          className="px-4 py-2 rounded bg-black text-white disabled:bg-gray-400"
        >
          {isLoading ? "生成中..." : "送信"}
        </button>
      </div>

      {phase && (
        <div className="text-sm text-gray-500">
          フェーズ: {phase === "retrieval" ? "検索中" : "生成中"}
        </div>
      )}

      <div className="whitespace-pre-wrap border rounded p-3 min-h-[4rem] bg-gray-50">
        {isLoading ? answer || "…生成中" : answer || "（結果なし）"}
      </div>

      {citations.length > 0 && (
        <div className="text-sm border rounded p-3 bg-blue-50">
          <div className="font-semibold mb-2">📚 出典</div>
          <ol className="list-decimal pl-5 space-y-1">
            {citations.map((c, i) => (
              <li key={i}>
                <span className="font-medium">{c.title || "（タイトルなし）"}</span>
                {c.page ? <> p.{c.page}</> : null}
                {c.section ? <> / {c.section}</> : null}
                {c.uri && (
                  <a
                    href={c.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-blue-600 hover:underline"
                  >
                    [リンク]
                  </a>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
```

---

## 🔐 プロキシ経由でヘッダを隠す（任意）

ブラウザから直接 `x-api-key` を出したくない場合、Next.js の Route Handler を作ってストリーム中継します。

### app/api/backend/generate/route.ts

```typescript
// app/api/backend/generate/route.ts
export const runtime = "nodejs";

export async function POST(req: Request) {
  const backend = process.env.NEXT_PUBLIC_RAG_API_URL + "/generate";
  const body = await req.text();

  const r = await fetch(backend, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key":
        process.env.RAG_API_KEY ||
        process.env.NEXT_PUBLIC_API_KEY ||
        "ollama-compatible",
    },
    body,
  });

  return new Response(r.body, {
    status: r.status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

### フロントの変更

```typescript
// lib/rag.ts の変更部分
const API_BASE = process.env.NEXT_PUBLIC_RAG_API_URL || "/api/backend";
// x-api-key ヘッダーを削除（プロキシ側で付与される）
const res = await fetch(`${API_BASE}/generate`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    // x-api-key は不要
  },
  body,
});
```

---

## 🧩 UIに足すと嬉しい小改善（任意）

### 1. トグルとスライダーの追加

```typescript
// components/RagChatAdvanced.tsx
const [useRerank, setUseRerank] = useState(true);
const [strictRag, setStrictRag] = useState(false);
const [alpha, setAlpha] = useState(0.6);
const [topK, setTopK] = useState(5);

// UI
<div className="flex gap-4 items-center text-sm">
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={useRerank}
      onChange={(e) => setUseRerank(e.target.checked)}
    />
    Rerank使用
  </label>

  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={strictRag}
      onChange={(e) => setStrictRag(e.target.checked)}
    />
    Strict RAG
  </label>

  <label className="flex items-center gap-2">
    検索件数:
    <input
      type="number"
      min="1"
      max="20"
      value={topK}
      onChange={(e) => setTopK(parseInt(e.target.value) || 5)}
      className="border rounded px-2 py-1 w-16"
    />
  </label>

  <label className="flex items-center gap-2">
    Alpha (ハイブリッド重み):
    <input
      type="range"
      min="0"
      max="1"
      step="0.1"
      value={alpha}
      onChange={(e) => setAlpha(parseFloat(e.target.value))}
      className="w-32"
    />
    <span className="w-8">{alpha.toFixed(1)}</span>
  </label>
</div>

// streamGenerate に渡す
for await (const ev of streamGenerate({
  query,
  tenant: "demo",
  top_k: topK,
  use_rerank: useRerank,
  strict_rag: strictRag,
  alpha: alpha,
})) {
  // ...
}
```

### 2. チャット履歴の保持

```typescript
const [history, setHistory] = useState<Array<{ role: string; content: string }>>([]);

const onAsk = async () => {
  const newHistory = [...history, { role: "user", content: query }];
  setHistory(newHistory);

  let fullAnswer = "";

  for await (const ev of streamGenerate({
    query,
    history: newHistory.slice(-10), // 直近10件のみ送信
    // ...
  })) {
    if (ev.type === "token") {
      fullAnswer += ev.token;
      setAnswer(fullAnswer);
    }
  }

  setHistory([...newHistory, { role: "assistant", content: fullAnswer }]);
};

// 履歴表示
{history.map((msg, i) => (
  <div key={i} className={msg.role === "user" ? "text-right" : "text-left"}>
    <div className="inline-block px-4 py-2 rounded" style={{
      backgroundColor: msg.role === "user" ? "#e3f2fd" : "#f5f5f5"
    }}>
      {msg.content}
    </div>
  </div>
))}
```

### 3. 出典ハイライト

```typescript
// 回答文の中で出典番号 [1] [2] をハイライト
const highlightCitations = (text: string) => {
  return text.replace(/\[(\d+)\]/g, (match, num) => {
    return `<span class="citation-mark" data-citation="${num}">${match}</span>`;
  });
};

// CSS
.citation-mark {
  background: #fef3c7;
  padding: 0 2px;
  border-radius: 2px;
  cursor: pointer;
  font-weight: 600;
}
.citation-mark:hover {
  background: #fde68a;
}
```

---

## 📊 SSEストリーミング形式の詳細

### 正常なストリーミング例

```
data: {"type":"status","phase":"retrieval"}

data: {"text":"東京は"}

data: {"text":"日本の首都"}

data: {"text":"です。"}

data: {"type":"status","phase":"generation_start"}

data: {"text":"政府機関が"}

data: {"text":"集中しています。"}

data: {"citations":[{"title":"東京概要","page":1,"section":"概要","uri":"doc://tokyo.pdf","content":"東京は日本の首都です..."}],"sources":[...]}
```

### エラーハンドリング

```typescript
try {
  for await (const ev of streamGenerate({ query, tenant: "demo" })) {
    // ...
  }
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes("HTTP 401")) {
      setAnswer("認証エラー: APIキーを確認してください。");
    } else if (error.message.includes("HTTP 500")) {
      setAnswer("サーバーエラーが発生しました。ログを確認してください。");
    } else {
      setAnswer(`エラー: ${error.message}`);
    }
  }
}
```

---

## 🚀 起動手順

### 1. バックエンド起動

```bash
cd /Users/saiteku/workspace/RAGgpt
npm run dev:autoport
```

**自動処理:**
- ポートの自動割り当て
- `.env.runtime` の生成
- `ui/.env.local` の生成
- Docker Compose起動
- Next.js UIの起動

### 2. ポート確認

```bash
eval "$(bash infrastructure/scripts/sync-ports.sh)"
echo "API: $PORT_API"
echo "UI: $PORT_UI"
```

### 3. ブラウザで確認

```
http://localhost:3000
```

---

## 🧪 デバッグ方法

### 1. SSEストリームの生ログを確認

```bash
curl -N -X POST "http://localhost:${PORT_API}/generate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{
    "query": "日本の首都は？",
    "tenant": "demo",
    "top_k": 3,
    "use_rerank": true
  }'
```

### 2. ブラウザDevToolsでネットワーク確認

1. DevTools → Network → Type: `eventsource` または `fetch`
2. リクエストヘッダーを確認（`x-api-key` が含まれているか）
3. レスポンスを確認（SSE形式でデータが流れているか）

### 3. APIログ確認

```bash
docker logs -f rag-api 2>&1 | grep -E "(generate\[|ERROR|WARNING)"
```

---

## ❌ よくあるエラーと対処法

### エラー1: "HTTP 401 Unauthorized"

**原因:** APIキーが間違っている

**対処:**
```bash
# .env.runtime を確認
cat .env.runtime | grep API_KEY

# ui/.env.local を確認
cat ui/.env.local | grep NEXT_PUBLIC_API_KEY

# 一致していない場合は再生成
npm run dev:autoport
```

### エラー2: "ECONNREFUSED"

**原因:** ポートがズレている

**対処:**
```bash
# 実ポートを確認
eval "$(bash infrastructure/scripts/sync-ports.sh)"

# ui/.env.local を手動更新
echo "NEXT_PUBLIC_RAG_API_URL=http://localhost:${PORT_API}" > ui/.env.local
echo "NEXT_PUBLIC_API_KEY=${API_KEY}" >> ui/.env.local

# UIを再起動
cd ui
npm run dev
```

### エラー3: "top_k が認識されない"

**原因:** リクエストで `k` を使っている

**対処:**
```typescript
// ❌ 間違い
{ query: "...", k: 5, rerank: true }

// ✅ 正しい
{ query: "...", top_k: 5, use_rerank: true }
```

### エラー4: "SSEが途中で切れる"

**原因:** プロキシのバッファリング

**対処:**
```typescript
// Route Handler に以下を追加
headers: {
  "X-Accel-Buffering": "no",  // nginx
  "Cache-Control": "no-cache, no-transform",
}
```

---

## 📝 まとめ

### 必須の変更

1. ✅ **SSE対応の実装** - `ReadableStream` でパース
2. ✅ **`top_k` / `use_rerank` のキー統一** - `/search` とは異なる
3. ✅ **環境変数の設定** - `NEXT_PUBLIC_RAG_API_URL` と `NEXT_PUBLIC_API_KEY`

### 推奨の改善

1. プロキシ Route でAPIキーを隠す
2. トグル・スライダーでパラメータ調整可能に
3. チャット履歴の保持
4. 出典ハイライト表示

### 動作確認

APIキーとポートの環境変数が UI に正しく渡っていれば、`npm run dev:autoport` でそのまま動作します。

---

## 🔗 関連ドキュメント

- [SEARCH_FIX_SUMMARY.md](./SEARCH_FIX_SUMMARY.md) - `/search` エンドポイントの修正
- [CHAT_FIX_SUMMARY.md](./CHAT_FIX_SUMMARY.md) - `/chat` エンドポイントの修正
- [PORT_SYNC_GUIDE.md](./PORT_SYNC_GUIDE.md) - ポート同期の完全ガイド
- [api/openapi.yaml](./api/openapi.yaml) - 完全なAPIスキーマ

---

**完成！** これで `npm run dev:autoport` から UI まで完全に動作します 🎉
