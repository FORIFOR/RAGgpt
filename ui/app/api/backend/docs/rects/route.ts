import { NextResponse, type NextRequest } from "next/server";

import { filterProxyHeaders, resolveScope } from "@/lib/backend";

const API_BASE =
  (process.env.BACKEND_BASE_URL ??
    process.env.RAG_SERVER_URL ??
    process.env.RAG_API_BASE ??
    process.env.RAG_BASE_URL ??
    "http://127.0.0.1:3002").replace(/\/$/, "");
const API_KEY = process.env.RAG_API_KEY || process.env.API_KEY || "";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const docId = req.nextUrl.searchParams.get("doc_id");
  if (!docId) {
    return NextResponse.json({ error: "doc_id required" }, { status: 400 });
  }

  let scope;
  try {
    scope = resolveScope(req.nextUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "scope_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const upstreamUrl = new URL(`${API_BASE}/docs/rects`);
  req.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });
  upstreamUrl.searchParams.set("doc_id", docId);
  upstreamUrl.searchParams.set("tenant", scope.tenant);
  upstreamUrl.searchParams.set("user_id", scope.user_id);
  upstreamUrl.searchParams.set("notebook_id", scope.notebook_id);
  upstreamUrl.searchParams.set("include_global", scope.include_global ? "true" : "false");
  upstreamUrl.searchParams.delete("notebook");
  if (!upstreamUrl.searchParams.has("engine")) {
    upstreamUrl.searchParams.set("engine", "chars");
  }
  if (!upstreamUrl.searchParams.has("include_items")) {
    upstreamUrl.searchParams.set("include_items", "1");
  }

  const headers = filterProxyHeaders(req.headers);
  headers.set("accept", "application/json");
  headers.set("x-requested-by", "ui");
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
      headers,
      redirect: "manual",
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (name.toLowerCase() === "transfer-encoding") return;
    responseHeaders.set(name, value);
  });
  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/json");
  }
  responseHeaders.set("cache-control", "no-transform");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
