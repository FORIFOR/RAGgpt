import { getScope, Scope } from "./scope";

export class ApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, message: string, body: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type QueryValue = string | number | boolean | undefined | null;

export type ApiFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, any> | string | FormData | undefined;
  query?: Record<string, QueryValue>;
  raw?: boolean;
  signal?: AbortSignal;
};

function toBooleanString(value?: boolean) {
  return value ? "true" : "false";
}

function getBaseOrigin() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_BASE_URL || "http://127.0.0.1:3000";
}

function createUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return new URL(path);
  }
  const origin = getBaseOrigin();
  const resolved = path.startsWith("/") ? path : `/${path}`;
  const base = process.env.NEXT_PUBLIC_API_BASE || "/api";
  if (resolved.startsWith("/api/") && base.startsWith("/")) {
    return new URL(`${origin}${resolved}`);
  }
  if (base.startsWith("http")) {
    return new URL(`${base}${resolved}`);
  }
  return new URL(`${origin}${base}${resolved}`);
}

function mergeScope(scope: Scope, target: Record<string, any>) {
  return {
    ...target,
    tenant: target.tenant ?? scope.tenant,
    user_id: target.user_id ?? scope.user_id,
    notebook_id: target.notebook_id ?? scope.notebook_id,
    include_global:
      target.include_global ?? (scope.include_global ? true : false),
  };
}

export async function apiFetch(path: string, opts: ApiFetchOptions = {}) {
  const scope = getScope();
  const url = createUrl(path);

  url.searchParams.set("tenant", scope.tenant);
  url.searchParams.set("user_id", scope.user_id);
  url.searchParams.set("notebook_id", scope.notebook_id);
  url.searchParams.set("include_global", toBooleanString(scope.include_global));

  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    "x-tenant": scope.tenant,
    "x-user-id": scope.user_id,
    "x-notebook-id": scope.notebook_id,
    "x-include-global": toBooleanString(scope.include_global),
    ...(opts.headers || {}),
  };

  let body: BodyInit | undefined;
  const originalBody = opts.body;

  if (originalBody instanceof FormData) {
    originalBody.set("tenant", scope.tenant);
    originalBody.set("user_id", scope.user_id);
    originalBody.set("notebook_id", scope.notebook_id);
    originalBody.set("include_global", toBooleanString(scope.include_global));
    body = originalBody;
  } else if (typeof originalBody === "string" && originalBody.trim().length > 0) {
    try {
      const parsed = JSON.parse(originalBody);
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      body = JSON.stringify(mergeScope(scope, parsed));
    } catch {
      body = originalBody;
    }
  } else if (originalBody && typeof originalBody === "object") {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    body = JSON.stringify(mergeScope(scope, originalBody));
  }

  const method = opts.method || (body ? "POST" : "GET");
  const fetchInit: RequestInit & { duplex?: "half" } = {
    method,
    headers,
    body,
    signal: opts.signal,
    cache: "no-store",
  };
  if (body && typeof fetchInit.duplex === "undefined") {
    fetchInit.duplex = "half";
  }

  const response = await fetch(url.toString(), fetchInit);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const message = text
      ? `API ${response.status}: ${text}`
      : `API ${response.status}: ${response.statusText}`;
    throw new ApiError(response.status, message, text);
  }

  if (opts.raw) return response;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export type { Scope };
