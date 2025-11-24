import { NextRequest, NextResponse } from "next/server";

import {
  collectNextcloudFiles,
  normalizeNextcloudPath,
  NextcloudConfigError,
  triggerIngestFromNextcloud,
} from "@/lib/nextcloud";
import { resolveScope, type BackendScope } from "@/lib/backend";

export const runtime = "nodejs";

type LinkPayload = {
  notebookId?: string;
  items?: Array<{ id?: string; path?: string; type?: string }>;
};

export async function POST(req: NextRequest) {
  let scope: BackendScope;
  try {
    scope = resolveScope(req.nextUrl);
  } catch (error) {
    return NextResponse.json(
      { error: "notebook_id is required", detail: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  let payload: LinkPayload;
  try {
    payload = (await req.json()) as LinkPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const notebookId = payload.notebookId?.trim() || scope.notebook_id;
  if (!notebookId) {
    return NextResponse.json({ error: "notebookId is required" }, { status: 422 });
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "items must not be empty" }, { status: 422 });
  }

  const fileItems = items.filter((item) => item.id);
  const pathItems = items.filter((item) => item.path && !item.id);
  const result: Record<string, any> = { ok: true };

  if (fileItems.length) {
    const ragBase =
      process.env.RAG_SERVER_URL ||
      process.env.RAG_API_BASE ||
      process.env.RAG_BASE_URL ||
      "http://127.0.0.1:3002";
    const targetUrl = `${ragBase.replace(/\/$/, "")}/library/files/link`;
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        tenant: scope.tenant,
        user_id: scope.user_id,
        notebook_id: notebookId,
        include_global: scope.include_global,
        item_ids: fileItems.map((item) => item.id),
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error || "link_failed", detail: data?.detail || response.statusText },
        { status: response.status },
      );
    }
    result.file = data;
  }

  if (pathItems.length) {
    const ingestScope: BackendScope = { ...scope, notebook_id: notebookId };
    const successes: string[] = [];
    const errors: Array<{ path: string; error: string }> = [];
    try {
      for (const item of pathItems) {
        const normalized = normalizeNextcloudPath(item.path || "/");
        if (item.type === "folder") {
          const files = await collectNextcloudFiles(normalized, { maxFiles: 500 });
          if (files.length === 0) {
            errors.push({ path: normalized, error: "フォルダ内にファイルがありません" });
            continue;
          }
          for (const file of files) {
            try {
              await triggerIngestFromNextcloud(ingestScope, file.path);
              successes.push(file.path);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              errors.push({ path: file.path, error: message });
            }
          }
        } else {
          try {
            await triggerIngestFromNextcloud(ingestScope, normalized);
            successes.push(normalized);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push({ path: normalized, error: message });
          }
        }
      }
    } catch (error) {
      if (error instanceof NextcloudConfigError) {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { error: "link_failed", detail: message },
        { status: 502 },
      );
    }
    result.nextcloud = { successes, errors };
  }

  return NextResponse.json(result);
}
