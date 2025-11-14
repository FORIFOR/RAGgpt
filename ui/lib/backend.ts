const DEFAULT_TENANT =
  (process.env.NEXT_PUBLIC_TENANT_ID ||
    process.env.NEXT_PUBLIC_TENANT ||
    process.env.RAG_TENANT_DEFAULT ||
    process.env.TENANT_DEFAULT ||
    "").trim() || "demo";

const DEFAULT_USER =
  (process.env.NEXT_PUBLIC_USER_ID ||
    process.env.RAG_DEFAULT_USER ||
    process.env.DEFAULT_USER_ID ||
    "").trim() || "local";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-length",
]);

export type BackendScope = {
  tenant: string;
  user_id: string;
  notebook_id: string;
  include_global: boolean;
};

type UrlLike = URL | { searchParams: URLSearchParams };

export function resolveScope(urlLike: UrlLike): BackendScope {
  const search = urlLike.searchParams;
  const tenant =
    (search.get("tenant") || DEFAULT_TENANT).trim() || DEFAULT_TENANT;
  const userId = (search.get("user_id") || DEFAULT_USER).trim() || DEFAULT_USER;
  const includeGlobal =
    (search.get("include_global") || "").toLowerCase() === "true";
  const notebookId =
    (search.get("notebook_id") || search.get("notebook") || "").trim();

  if (!notebookId) {
    throw new Error("notebook_id is required");
  }

  return {
    tenant,
    user_id: userId,
    notebook_id: notebookId,
    include_global: includeGlobal,
  };
}

export function filterProxyHeaders(headers: Headers): Headers {
  const next = new Headers();
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) return;
    next.set(key, value);
  });
  if (!next.has("cache-control")) {
    next.set("Cache-Control", "no-cache");
  }
  next.set("Connection", "keep-alive");
  return next;
}
