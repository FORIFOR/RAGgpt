import { NextRequest, NextResponse } from "next/server";

import { resolveNotebookFolderPath } from "@/lib/nextcloud";
import { resolveScope } from "@/lib/backend";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const scope = resolveScope(req.nextUrl);
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 422 });
  }

  const notebookId =
    (formData.get("notebookId")?.toString().trim() || scope.notebook_id)?.trim();
  if (!notebookId) {
    return NextResponse.json({ error: "notebookId is required" }, { status: 422 });
  }

  const folderOverride = formData.get("folderPath");
  const folderPath = resolveNotebookFolderPath(
    notebookId,
    typeof folderOverride === "string" ? folderOverride : undefined,
  );
  const storageScope = (formData.get("storageScope")?.toString().trim().toLowerCase() ||
    (scope.include_global ? "org" : "personal")) as "personal" | "org";

  const ragBase =
    process.env.RAG_SERVER_URL ||
    process.env.RAG_API_BASE ||
    process.env.RAG_BASE_URL ||
    "http://127.0.0.1:3002";
  const targetUrl = `${ragBase.replace(/\/$/, "")}/library/files`;
  const uploadForm = new FormData();
  uploadForm.set("tenant", scope.tenant);
  uploadForm.set("user_id", scope.user_id);
  uploadForm.set("scope", storageScope);
  uploadForm.set("folder_path", folderPath);
  uploadForm.set("notebook_id", notebookId);
  uploadForm.append("file", file, sanitizeFileName(file.name || "uploaded-file"));

  const response = await fetch(targetUrl, {
    method: "POST",
    body: uploadForm,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof payload?.detail === "string" ? payload.detail : payload?.error || response.statusText;
    return NextResponse.json(
      { error: payload?.error || "upload_failed", detail },
      { status: response.status },
    );
  }

  return NextResponse.json({
    ok: true,
    notebookId,
    folderPath,
    file: payload,
    strategy: "direct",
  });
}

function sanitizeFileName(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return `uploaded-${Date.now()}`;
  }
  return trimmed.replace(/[\\/:*?"<>|]/g, "_");
}
