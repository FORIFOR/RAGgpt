import { apiFetch } from "./api";
import { getScope } from "./scope";

let aborter: AbortController | null = null;

export async function quickSearch(q: string, topK = 8) {
  aborter?.abort();
  aborter = new AbortController();
  let profile = "balanced";
  try {
    profile = localStorage.getItem("rag.profile") || "balanced";
  } catch {
    /* ignore */
  }
  const scope = getScope();
  const res = await apiFetch("/api/backend/search", {
    method: "POST",
    query: { profile },
    body: {
      query: q,
      limit: topK,
      k: topK,
      rerank: true,
      selected_ids: [],
      tenant: scope.tenant,
      notebook_id: scope.notebook_id,
      user_id: scope.user_id,
    },
    signal: aborter.signal || undefined,
  });
  if (Array.isArray((res as any).hits)) {
    return (res as any).hits.map((h: any) => ({
      id: h.id || h.chunk_id,
      doc_id: h.sourceId || h.doc_id,
      page: h.page,
      score: h.score || h.hybrid_score || 0,
      snippet: h.snippet || (h.text || "").slice(0, 200),
    }));
  }
  return [];
}

export function debounce<T extends (...args: any[]) => any>(fn: T, ms = 180) {
  let t: any;
  return (...args: any[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
