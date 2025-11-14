import { NextRequest, NextResponse } from "next/server";

import { resolveScope, filterProxyHeaders } from "@/lib/backend";

const RAG_BASE =
  process.env.RAG_SERVER_URL ??
  process.env.RAG_API_BASE ??
  process.env.RAG_BASE_URL ??
  "http://127.0.0.1:3002";
const API_KEY = process.env.RAG_API_KEY || process.env.API_KEY || "";

function buildScopeQuery(scope: ReturnType<typeof resolveScope>) {
  const qs = new URLSearchParams();
  qs.set("tenant", scope.tenant);
  qs.set("user_id", scope.user_id);
  qs.set("notebook_id", scope.notebook_id);
  qs.set("include_global", scope.include_global ? "true" : "false");
  return qs;
}

function buildHeaders(scope: ReturnType<typeof resolveScope>) {
  const headers: Record<string, string> = {
    "x-tenant": scope.tenant,
    "x-user-id": scope.user_id,
    "x-notebook-id": scope.notebook_id,
    "x-include-global": scope.include_global ? "true" : "false",
  };
  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
    headers["x-api-key"] = API_KEY;
  }
  return headers;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  let scope;
  try {
    scope = resolveScope(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "scope_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const qs = buildScopeQuery(scope);
  const upstream = await fetch(`${RAG_BASE}/conversations?${qs.toString()}`, {
    headers: buildHeaders(scope),
    cache: "no-store",
  });
  const headers = filterProxyHeaders(upstream.headers);
  const text = await upstream.text().catch(() => "{}");
  return new NextResponse(text, {
    status: upstream.status,
    headers,
  });
}

export async function PUT(req: NextRequest) {
  const url = new URL(req.url);
  let scope;
  try {
    scope = resolveScope(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "scope_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (error) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const payload = {
    ...(body && typeof body === "object" ? body : {}),
    tenant: scope.tenant,
    user_id: scope.user_id,
    notebook_id: scope.notebook_id,
    include_global: scope.include_global,
  };

  const upstream = await fetch(`${RAG_BASE}/conversations`, {
    method: "PUT",
    headers: {
      ...buildHeaders(scope),
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const headers = filterProxyHeaders(upstream.headers);
  const text = await upstream.text().catch(() => "{}");
  return new NextResponse(text, {
    status: upstream.status,
    headers,
  });
}
