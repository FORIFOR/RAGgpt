import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RAG_BASE =
  process.env.RAG_SERVER_URL ??
  process.env.RAG_API_BASE ??
  process.env.RAG_BASE_URL ??
  "http://127.0.0.1:3002";
const API_KEY = process.env.RAG_API_KEY || process.env.API_KEY || "";
const REQUEST_TIMEOUT_MS = Number(
  process.env.RAG_GENERATE_TIMEOUT_MS ?? "240000",
);

type Scope = {
  tenant: string;
  user_id: string;
  notebook_id: string;
  include_global: boolean;
};

function readScope(req: NextRequest, body: Record<string, any>): Scope {
  const url = new URL(req.url);
  const tenant = url.searchParams.get("tenant") || body.tenant;
  const userId = url.searchParams.get("user_id") || body.user_id;
  const notebookId =
    url.searchParams.get("notebook_id") ||
    body.notebook_id ||
    url.searchParams.get("notebook") ||
    body.notebook;
  const includeGlobalParam =
    url.searchParams.get("include_global") ??
    String(body.include_global ?? "");

  const includeGlobal = ["1", "true", "yes", "on"].includes(
    includeGlobalParam.toLowerCase(),
  );

  if (!tenant || !userId || !notebookId) {
    throw new Error("missing_scope");
  }

  return {
    tenant,
    user_id: userId,
    notebook_id: notebookId,
    include_global: includeGlobal,
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let body: Record<string, any> = { selected_ids: [], query: "", rerank: false };
  if (rawBody.trim().length > 0) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      // keep default body fallback
    }
  }

  let scope: Scope;
  try {
    scope = readScope(req, body);
  } catch {
    return NextResponse.json({ error: "missing scope" }, { status: 422 });
  }

  const payload = {
    stream: body.stream ?? true,
    query: body.query,
    selected_ids: Array.isArray(body.selected_ids)
      ? body.selected_ids
      : undefined,
    k: Number(body.k ?? body.top_k ?? 8),
    rerank: Boolean(body.rerank ?? body.use_rerank),
    include_global: scope.include_global,
    notebook: scope.notebook_id,
    notebook_id: scope.notebook_id,
    tenant: scope.tenant,
    user_id: scope.user_id,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (typeof (timeout as NodeJS.Timeout).unref === "function") {
    (timeout as NodeJS.Timeout).unref();
  }

  try {
    const upstream = await fetch(`${RAG_BASE}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Connection: "keep-alive",
        ...(API_KEY
          ? { Authorization: `Bearer ${API_KEY}`, "x-api-key": API_KEY }
          : {}),
        "x-tenant": scope.tenant,
        "x-user-id": scope.user_id,
        "x-notebook-id": scope.notebook_id,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!upstream.body) {
      const text = await upstream.text().catch(() => "Upstream error");
      return NextResponse.json({ error: text }, { status: upstream.status });
    }

    const headers = new Headers(upstream.headers);
    headers.set(
      "Content-Type",
      headers.get("Content-Type") || "text/event-stream",
    );
    headers.set("Cache-Control", "no-cache, no-transform");
    headers.set("x-accel-buffering", "no");
    headers.set("Connection", "keep-alive");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    const err = error as Error;
    const status = err.name === "AbortError" ? 504 : 502;
    return NextResponse.json({ error: err.message }, { status });
  } finally {
    clearTimeout(timeout);
  }
}
