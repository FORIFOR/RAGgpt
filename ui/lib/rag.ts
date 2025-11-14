import { useTraceStore, flushToConsole } from "./trace-store";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

// 起動時にAPI設定を表示（デバッグ用）
if (typeof window !== 'undefined') {
  console.info('[RAG] API_BASE=%s API_KEY=%s***', API_BASE, API_KEY.slice(0, 3) || '(empty)');
}

// リクエスト毎のトレースIDを付与して相関を取りやすく
export async function* streamGenerate(params: {
  query: string;
  tenant: string;
  notebook: string;
  user_id?: string;
  include_global?: boolean;
  top_k?: number;
  use_rerank?: boolean;
  alpha?: number;
  strict_rag?: boolean;
  selected_ids?: string[];
  doc_filter?: string[];
  provider?: string;
  profile?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  debugLabel?: string; // 画面上のラベル
}) {
  const store = useTraceStore.getState();
  const traceId = store.newTrace(params.debugLabel ?? "generate");
  const t = (type: any, payload: any = {}) => store.addEvent(traceId, { t: performance.now(), type, ...payload });

  if (!params.user_id) {
    throw new Error('user_id is required for streamGenerate');
  }

  const body = JSON.stringify({
    tenant: params.tenant,
    notebook: params.notebook,
    user_id: params.user_id,
    notebook_id: params.notebook,
    query: params.query,
    top_k: params.top_k ?? 8,
    use_rerank: params.use_rerank ?? true,
    alpha: params.alpha ?? 0.6,
    strict_rag: params.strict_rag ?? true, // 証拠なしで生成しない
    selected_ids: params.selected_ids ?? [],
    doc_filter: params.doc_filter ?? [],
    stream: true,
    use_rag: true,
    provider: params.provider,
    profile: params.profile,
    model: params.model,
    temperature: params.temperature,
    max_tokens: params.max_tokens,
    include_global: params.include_global ?? false,
  });

  console.info("[RAG] Request:", {
    tenant: params.tenant,
    notebook: params.notebook,
    user_id: params.user_id,
    include_global: params.include_global ?? false,
    query: params.query.slice(0, 50) + "...",
    top_k: params.top_k ?? 8,
    use_rerank: params.use_rerank ?? true,
    traceId,
  });

  // 1) リクエスト開始
  t("request_start", {
    method: "POST",
    url: `${API_BASE}/generate`,
    bodyBytes: new Blob([body]).size,
    clientTraceId: traceId,
  });

  let res: Response;
  try {
    const queryParams = new URLSearchParams();
    queryParams.set("tenant", params.tenant ?? "demo");
    queryParams.set("notebook", params.notebook);
    queryParams.set("user_id", params.user_id);
    queryParams.set("notebook_id", params.notebook);
    queryParams.set("include_global", params.include_global ? 'true' : 'false');
    res = await fetch(`${API_BASE}/generate?${queryParams.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        // クライアント相関IDをヘッダに入れておく（将来バックエンドで拾える）
        "x-client-trace-id": traceId,
        "x-tenant": params.tenant,
        "x-notebook": params.notebook,
        "x-user-id": params.user_id,
      },
      body,
    });
  } catch (err: any) {
    const msg = `Fetch failed: ${err?.message || 'Network error'}`;
    console.error('[RAG] Fetch error:', { err, base: API_BASE, hasKey: !!API_KEY });
    t("error", { message: msg });
    if (process.env.NEXT_PUBLIC_DEBUG_RAG === "1") flushToConsole(traceId);
    throw new Error(msg);
  }

  const serverRid = res.headers.get("x-request-id") || undefined;
  t("response_headers", { status: res.status, requestId: serverRid });

  if (!res.ok || !res.body) {
    const msg = `HTTP ${res.status}`;
    t("error", { message: msg });
    if (process.env.NEXT_PUBLIC_DEBUG_RAG === "1") flushToConsole(traceId);
    throw new Error(msg);
  }

  // 2) SSEの読み取りと解析
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let tokenCount = 0;
  let isFirstToken = true;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });

    const lines = carry.split(/\r?\n/);
    carry = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue; // ping

      // JSON試行→失敗したら素トークン
      let obj: any | null = null;
      try {
        obj = JSON.parse(data);
      } catch {
        obj = null;
      }

      if (obj) {
        // statusイベント（検索フェーズ・生成開始）
        if (obj.type === "status") {
          const phase = obj.phase === "retrieval" ? "retrieval" : obj.phase === "generation_start" ? "generation_start" : obj.phase;
          if (phase === "retrieval" || phase === "generation_start") {
            t("sse_status", { phase, candidates: obj.candidates, llm: obj.llm, gate_passed: obj.gate_passed });
            if (phase === "retrieval") {
              console.info("[RAG] Retrieval phase: candidates =", obj.candidates, "gate_passed=", obj.gate_passed);
            } else if (phase === "generation_start") {
              console.info("[RAG] Generation starting");
              if (obj.llm) {
                console.info("[RAG] LLM config:", obj.llm);
              }
            }
          }
        }

        // デバッグイベント
        if (obj.event === "rag.search.request") {
          console.info("[RAG] Search request:", obj);
        }
        if (obj.event === "rag.vector.search") {
          console.info("[RAG] Vector search:", { hits: obj.hits, dt_ms: obj.dt_ms });
        }
        if (obj.event === "rag.bm25.search") {
          console.info("[RAG] BM25 search:", { hits: obj.hits, dt_ms: obj.dt_ms });
        }
        if (obj.event === "rag.hybrid.merge") {
          console.info("[RAG] Merged hits:", obj.merged?.length, obj.merged?.map((m: any) => m.title));
          t("sse_status", { phase: "retrieval", candidates: obj.merged?.length });
        }

        if (obj.llm && !obj.event) {
          t("sse_llm_meta", { llm: obj.llm });
        }

        if (typeof obj.gate_passed === "boolean") {
          t("sse_gate", { gate_passed: obj.gate_passed });
        }

        // トークン抽出
        const token = obj.text ?? obj.delta ?? obj.answer ?? obj.content ?? "";
        if (token) {
          if (isFirstToken) {
            // 最初のトークンが来たら生成開始と見なす
            t("sse_status", { phase: "generation_start" });
            isFirstToken = false;
          }
          tokenCount += 1;
          t("sse_token", { token, bytes: new Blob([token]).size });
          yield { type: "token" as const, token, traceId };
        }

        // 最終データ（citations/sources）
        if (obj.citations || obj.sources) {
          console.info("[RAG] Final data:", {
            citations: obj.citations?.length ?? 0,
            sources: obj.sources?.length ?? 0,
            gate_passed: obj.gate_passed,
          });
          t("sse_final", {
            citations: obj.citations ?? [],
            sources: obj.sources ?? [],
            llm: obj.llm,
            gate_passed: obj.gate_passed,
          });
          yield {
            type: "final" as const,
            citations: obj.citations ?? [],
            sources: obj.sources ?? [],
            llm: obj.llm,
            traceId,
            gate_passed: obj.gate_passed,
          };
        }
      } else {
        // 非JSONの素トークン
        if (isFirstToken) {
          t("sse_status", { phase: "generation_start" });
          isFirstToken = false;
        }
        tokenCount += 1;
        t("sse_token", { token: data, bytes: new Blob([data]).size });
        yield { type: "token" as const, token: data, traceId };
      }
    }
  }

  t("done", {});
  // デバッグ時にまとめてコンソールへ
  if (process.env.NEXT_PUBLIC_DEBUG_RAG === "1") flushToConsole(traceId);
}
