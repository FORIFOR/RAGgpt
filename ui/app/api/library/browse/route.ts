import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function normalizePath(value: string) {
  if (!value) return "/";
  let cleaned = value.trim();
  if (!cleaned.startsWith("/")) cleaned = `/${cleaned}`;
  cleaned = cleaned.replace(/\/+/g, "/");
  return cleaned || "/";
}

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams;
  const path = normalizePath(search.get("path") || "/");
  const tenant = search.get("tenant") || process.env.NEXT_PUBLIC_TENANT_ID || process.env.TENANT_DEFAULT || "demo";
  const userId = search.get("user_id") || process.env.NEXT_PUBLIC_USER_ID || "local";
  const baseUrl =
    process.env.RAG_SERVER_URL ||
    process.env.RAG_API_BASE ||
    process.env.RAG_BASE_URL ||
    "http://127.0.0.1:3002";
  const filesUrl = new URL("/library/files", baseUrl.replace(/\/$/, ""));
  filesUrl.searchParams.set("tenant", tenant);
  filesUrl.searchParams.set("user_id", userId);
  filesUrl.searchParams.set("folder_path", path);

  const foldersUrl = new URL("/library/files/folders", baseUrl.replace(/\/$/, ""));
  foldersUrl.searchParams.set("tenant", tenant);
  foldersUrl.searchParams.set("user_id", userId);

  try {
    const [filesRes, foldersRes] = await Promise.all([
      fetch(filesUrl.toString(), { headers: { Accept: "application/json" }, cache: "no-store" }),
      fetch(foldersUrl.toString(), { headers: { Accept: "application/json" }, cache: "no-store" }),
    ]);
    const filesPayload = await filesRes.json().catch(() => null);
    const foldersPayload = await foldersRes.json().catch(() => null);

    if (!filesRes.ok) {
      const detail = filesPayload?.detail || filesPayload?.error || filesRes.statusText;
      return NextResponse.json(
        { error: "browse_failed", detail },
        { status: filesRes.status },
      );
    }

    if (!foldersRes.ok) {
      const detail = foldersPayload?.detail || foldersPayload?.error || foldersRes.statusText;
      return NextResponse.json(
        { error: "browse_failed", detail },
        { status: foldersRes.status },
      );
    }

    return NextResponse.json({
      configured: true,
      path,
      entries: filesPayload?.items || [],
      folders: foldersPayload?.folders || ["/"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "browse_failed", detail: message },
      { status: 502 },
    );
  }
}
