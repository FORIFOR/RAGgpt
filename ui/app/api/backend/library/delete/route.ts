import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_TENANT, DEFAULT_USER } from "@/lib/scope";

export const runtime = "nodejs";

type DeletePayload = {
  itemIds?: string[];
};

export async function POST(req: NextRequest) {
  let payload: DeletePayload;
  try {
    payload = (await req.json()) as DeletePayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const ids = Array.isArray(payload.itemIds) ? payload.itemIds.filter(Boolean) : [];
  if (!ids.length) {
    return NextResponse.json({ error: "itemIds_required" }, { status: 422 });
  }

  const tenant = req.nextUrl.searchParams.get("tenant")?.trim() || DEFAULT_TENANT;
  const user = req.nextUrl.searchParams.get("user_id")?.trim() || DEFAULT_USER;
  const ragBase =
    process.env.RAG_SERVER_URL ||
    process.env.RAG_API_BASE ||
    process.env.RAG_BASE_URL ||
    "http://127.0.0.1:3002";
  const targetUrl = `${ragBase.replace(/\/$/, "")}/library/files/delete`;
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      tenant,
      user_id: user,
      item_ids: ids,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(
      { error: data?.error || "delete_failed", detail: data?.detail || response.statusText },
      { status: response.status },
    );
  }
  return NextResponse.json(data);
}
