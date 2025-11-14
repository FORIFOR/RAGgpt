import { NextRequest, NextResponse } from "next/server";

import { resolveScope, filterProxyHeaders } from "@/lib/backend";

const RAG_BASE =
  process.env.RAG_SERVER_URL ??
  process.env.RAG_API_BASE ??
  process.env.RAG_BASE_URL ??
  "http://127.0.0.1:3002";
const API_KEY = process.env.RAG_API_KEY || process.env.API_KEY || "";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { docId: string } }) {
  const url = new URL(req.url);
  let scope;
  try {
    scope = resolveScope(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "scope_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const payload = {
    queries: Array.isArray(body?.queries) ? body.queries : [],
    pages: Array.isArray(body?.pages) ? body.pages : undefined,
    max_hits:
      typeof body?.max_hits === "number" && Number.isFinite(body.max_hits)
        ? body.max_hits
        : undefined,
    tenant: scope.tenant,
    user_id: scope.user_id,
    notebook_id: scope.notebook_id,
    include_global: scope.include_global,
  };

  if (!payload.queries.length && typeof body?.query === "string") {
    payload.queries = [body.query];
  }

  const upstream = await fetch(
    `${RAG_BASE}/docs/${encodeURIComponent(params.docId)}/locate?tenant=${encodeURIComponent(scope.tenant)}&user_id=${encodeURIComponent(scope.user_id)}&notebook_id=${encodeURIComponent(scope.notebook_id)}&include_global=${scope.include_global ? "true" : "false"}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant": scope.tenant,
        "x-user-id": scope.user_id,
        "x-notebook-id": scope.notebook_id,
        "x-include-global": scope.include_global ? "true" : "false",
        ...(API_KEY
          ? {
              Authorization: `Bearer ${API_KEY}`,
              "x-api-key": API_KEY,
            }
          : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );

  const headers = filterProxyHeaders(upstream.headers);
  const text = await upstream.text().catch(() => "{}");
  return new NextResponse(text, {
    status: upstream.status,
    headers,
  });
}
