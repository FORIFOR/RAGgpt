import type { NextRequest } from "next/server";

import { resolveScope, filterProxyHeaders } from "@/lib/backend";

const RAG_BASE =
  (process.env.RAG_SERVER_URL ??
    process.env.RAG_API_BASE ??
    process.env.RAG_BASE_URL ??
    "http://127.0.0.1:3002").replace(/\/$/, "");
const API_KEY = process.env.RAG_API_KEY || process.env.API_KEY || "";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { docId: string } }) {
  const url = new URL(req.url);
  let scope;
  try {
    scope = resolveScope(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "scope_error";
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

  const upstreamUrl = `${RAG_BASE}/docs/${encodeURIComponent(params.docId)}/meta?${url.searchParams.toString()}`;

  const headers = new Headers();
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
    upstream = await fetch(upstreamUrl, {
      headers,
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const responseHeaders = filterProxyHeaders(upstream.headers);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
