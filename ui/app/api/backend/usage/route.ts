import { NextRequest, NextResponse } from "next/server";

const RAG_BASE =
  process.env.RAG_SERVER_URL ??
  process.env.RAG_API_BASE ??
  process.env.RAG_BASE_URL ??
  "http://127.0.0.1:3002";
const API_KEY = process.env.RAG_API_KEY || process.env.API_KEY || "";

function parseBoolean(value: string | null): boolean {
  if (value === null) return false;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "t", "yes", "y", "on"].includes(normalized)) return true;
  if (
    ["0", "false", "f", "no", "n", "off", ""].includes(normalized)
  )
    return false;
  return false;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenant = url.searchParams.get("tenant");
  const userId = url.searchParams.get("user_id");
  const notebookId =
    url.searchParams.get("notebook_id") || url.searchParams.get("notebook");
  const includeGlobal = parseBoolean(url.searchParams.get("include_global"));

  if (!tenant || !userId || !notebookId) {
    return NextResponse.json({ error: "missing scope" }, { status: 422 });
  }

  const qs = new URLSearchParams({
    tenant,
    user_id: userId,
    notebook: notebookId,
    notebook_id: notebookId,
    include_global: includeGlobal ? "true" : "false",
  });

  const upstream = await fetch(`${RAG_BASE}/usage?${qs.toString()}`, {
    headers: {
      "x-tenant": tenant,
      "x-user-id": userId,
      "x-notebook-id": notebookId,
      ...(API_KEY ? { Authorization: `Bearer ${API_KEY}`, "x-api-key": API_KEY } : {}),
    },
    cache: "no-store",
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
