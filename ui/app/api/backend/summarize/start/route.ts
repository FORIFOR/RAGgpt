import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAG_BASE =
  process.env.RAG_SERVER_URL ??
  process.env.RAG_API_BASE ??
  process.env.RAG_BASE_URL ??
  "http://127.0.0.1:3002";
const API_KEY = process.env.RAG_API_KEY || process.env.API_KEY || "";
const REQUEST_TIMEOUT_MS = 120_000;

type Scope = {
  tenant: string;
  user_id: string;
  notebook_id: string;
  include_global: boolean;
};

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return false;
  const normalized = `${value}`.trim().toLowerCase();
  if (["1", "true", "t", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "f", "no", "n", "off", ""].includes(normalized))
    return false;
  return false;
}

function readScope(req: NextRequest, body: Record<string, any>): Scope {
  const url = new URL(req.url);
  const tenant = url.searchParams.get("tenant") || body.tenant;
  const userId = url.searchParams.get("user_id") || body.user_id;
  const notebookId =
    url.searchParams.get("notebook_id") ||
    body.notebook_id ||
    url.searchParams.get("notebook") ||
    body.notebook;
  const includeGlobal = parseBoolean(
    url.searchParams.get("include_global") ?? body.include_global,
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
  const raw = await req.text();
  let body: Record<string, any> = {};
  if (raw.trim().length > 0) {
    try {
      body = JSON.parse(raw);
    } catch (err) {
      return NextResponse.json(
        { error: "invalid_json", detail: (err as Error).message },
        { status: 400 },
      );
    }
  }

  let scope: Scope;
  try {
    scope = readScope(req, body);
  } catch {
    return NextResponse.json({ error: "missing scope" }, { status: 422 });
  }

  if (!Array.isArray(body.doc_ids) || body.doc_ids.length === 0) {
    return NextResponse.json({ error: "doc_ids required" }, { status: 422 });
  }

  const payload = {
    ...body,
    tenant: scope.tenant,
    user_id: scope.user_id,
    notebook_id: scope.notebook_id,
    notebook: scope.notebook_id,
    include_global: scope.include_global,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${RAG_BASE}/summarize/start`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY
          ? { Authorization: `Bearer ${API_KEY}`, "x-api-key": API_KEY }
          : {}),
        "x-tenant": scope.tenant,
        "x-user-id": scope.user_id,
        "x-notebook-id": scope.notebook_id,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await upstream.text().catch(() => "{}");
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    const err = error as Error;
    const status = err.name === "AbortError" ? 504 : 502;
    return NextResponse.json(
      { error: err.message || "summarize_start_failed" },
      { status },
    );
  } finally {
    clearTimeout(timeout);
  }
}
