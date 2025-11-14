import type { NextRequest } from "next/server";
import { resolveScope } from "@/lib/backend";

const RAG_BASE =
  (process.env.RAG_SERVER_URL ??
    process.env.RAG_API_BASE ??
    process.env.RAG_BASE_URL ??
    "http://127.0.0.1:3002").replace(/\/$/, "");
const API_KEY = process.env.RAG_API_KEY || process.env.API_KEY || "";
const PASSTHROUGH_RESPONSE_HEADERS = [
  "content-type",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "cache-control",
  "content-disposition",
];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxyPdfRequest(
  req: NextRequest,
  params: { docId: string },
  method: "GET" | "HEAD",
) {
  const url = new URL(req.url);
  let scope;
  try {
    scope = resolveScope(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "scope_error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  url.searchParams.set("tenant", scope.tenant);
  url.searchParams.set("user_id", scope.user_id);
  url.searchParams.set("notebook_id", scope.notebook_id);
  url.searchParams.set("include_global", scope.include_global ? "true" : "false");
  url.searchParams.delete("notebook");

  const upstreamUrl = new URL(
    `${RAG_BASE}/docs/${encodeURIComponent(params.docId)}/pdf`,
  );
  upstreamUrl.search = url.searchParams.toString();

  const headers = new Headers();
  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    headers.set("range", rangeHeader);
  }
  headers.set("x-tenant", scope.tenant);
  headers.set("x-user-id", scope.user_id);
  headers.set("x-notebook-id", scope.notebook_id);
  headers.set("x-include-global", scope.include_global ? "true" : "false");
  if (API_KEY) {
    headers.set("authorization", `Bearer ${API_KEY}`);
    headers.set("x-api-key", API_KEY);
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      method,
      headers,
      redirect: "manual",
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const responseHeaders = new Headers();
  PASSTHROUGH_RESPONSE_HEADERS.forEach((name) => {
    const value = upstream.headers.get(name);
    if (value) {
      responseHeaders.set(name, value);
    }
  });
  const existingCache = responseHeaders.get("cache-control");
  responseHeaders.set(
    "cache-control",
    existingCache ? `${existingCache}, no-transform` : "no-transform",
  );

  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(req: NextRequest, context: { params: { docId: string } }) {
  return proxyPdfRequest(req, context.params, "GET");
}

export async function HEAD(req: NextRequest, context: { params: { docId: string } }) {
  return proxyPdfRequest(req, context.params, "HEAD");
}
