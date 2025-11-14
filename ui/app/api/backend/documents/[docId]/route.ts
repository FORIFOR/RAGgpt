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
  if (["0", "false", "f", "no", "n", "off", ""].includes(normalized)) {
    return false;
  }
  return false;
}

function extractScope(url: URL) {
  const tenant = url.searchParams.get("tenant");
  const userId = url.searchParams.get("user_id") || "";
  const notebookId =
    url.searchParams.get("notebook_id") || url.searchParams.get("notebook");
  const includeGlobal = parseBoolean(url.searchParams.get("include_global"));

  if (!tenant || !userId || !notebookId) {
    throw new Error("missing_scope");
  }

  return { tenant, userId, notebookId, includeGlobal };
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { docId: string } },
) {
  const { docId } = params;
  let scope;
  try {
    scope = extractScope(new URL(req.url));
  } catch {
    return NextResponse.json({ error: "missing scope" }, { status: 422 });
  }

  const qs = new URLSearchParams({
    tenant: scope.tenant,
    user_id: scope.userId,
    notebook: scope.notebookId,
    notebook_id: scope.notebookId,
    include_global: scope.includeGlobal ? "true" : "false",
  });

  const upstream = await fetch(
    `${RAG_BASE}/documents/${encodeURIComponent(docId)}?${qs.toString()}`,
    {
      method: "DELETE",
      headers: {
        "x-tenant": scope.tenant,
        "x-user-id": scope.userId,
        "x-notebook-id": scope.notebookId,
        ...(API_KEY
          ? { Authorization: `Bearer ${API_KEY}`, "x-api-key": API_KEY }
          : {}),
      },
    },
  );

  const text = await upstream.text().catch(() => "{}");
  return new NextResponse(text || "{}", {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") || "application/json",
    },
  });
}
