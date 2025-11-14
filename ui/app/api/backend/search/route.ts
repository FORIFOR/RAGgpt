import { NextRequest, NextResponse } from "next/server";

const RAG_BASE =
  process.env.RAG_SERVER_URL ??
  process.env.RAG_API_BASE ??
  process.env.RAG_BASE_URL ??
  "http://127.0.0.1:3002";
const API_KEY = process.env.RAG_API_KEY || process.env.API_KEY || "";

function parseBoolean(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  const normalized = `${value}`.trim().toLowerCase();
  if (["1", "true", "t", "yes", "y", "on"].includes(normalized)) return true;
  if (
    ["0", "false", "f", "no", "n", "off", ""].includes(normalized)
  )
    return false;
  return false;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
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
    return NextResponse.json({ error: "missing scope" }, { status: 422 });
  }

  const payload = {
    query: body.query,
    limit: Number(body.limit ?? 8),
    k: Number(body.k ?? 8),
    rerank: Boolean(body.rerank ?? body.use_rerank),
    include_global: includeGlobal,
    notebook: notebookId,
    notebook_id: notebookId,
    tenant,
    user_id: userId,
  };

  const upstream = await fetch(`${RAG_BASE}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { Authorization: `Bearer ${API_KEY}`, "x-api-key": API_KEY } : {}),
      "x-tenant": tenant,
      "x-user-id": userId,
      "x-notebook-id": notebookId,
    },
    body: JSON.stringify(payload),
  });

  const text = await upstream.text().catch(() => "{}");
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") || "application/json",
    },
  });
}
