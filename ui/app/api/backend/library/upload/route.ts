import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_TENANT, DEFAULT_USER } from "@/lib/scope";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant")?.trim() || DEFAULT_TENANT;
  const userId = req.nextUrl.searchParams.get("user_id")?.trim() || DEFAULT_USER;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 422 });
  }
  const folder = normalizeFolder(formData.get("folder")?.toString() || "/");
  const scope = normalizeScope(formData.get("scope")?.toString() || "personal");

  const baseUrl =
    process.env.RAG_SERVER_URL ||
    process.env.RAG_API_BASE ||
    process.env.RAG_BASE_URL ||
    "http://127.0.0.1:3002";
  const targetUrl = new URL("/library/files", baseUrl.replace(/\/$/, ""));
  const upstream = new FormData();
  upstream.set("tenant", tenant);
  upstream.set("user_id", userId);
  upstream.set("scope", scope);
  upstream.set("folder_path", folder);
  upstream.append("file", file, sanitizeFileName(file.name || "uploaded-file"));

  const response = await fetch(targetUrl, { method: "POST", body: upstream });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.detail || payload?.error || response.statusText;
    return NextResponse.json({ error: "upload_failed", detail }, { status: response.status });
  }

  return NextResponse.json(payload);
}

function normalizeFolder(path: string) {
  if (!path) return "/";
  let cleaned = path.trim();
  if (!cleaned.startsWith("/")) cleaned = `/${cleaned}`;
  cleaned = cleaned.replace(/\/+/g, "/");
  return cleaned || "/";
}

function normalizeScope(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "personal" ? "personal" : "org";
}

function sanitizeFileName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return `uploaded-${Date.now()}`;
  }
  return trimmed.replace(/[\\/:*?"<>|]/g, "_");
}
