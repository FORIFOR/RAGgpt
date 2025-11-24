import { NextRequest, NextResponse } from "next/server";

import {
  normalizeNextcloudPath,
  triggerIngestFromNextcloud,
  NextcloudConfigError,
} from "@/lib/nextcloud";
import { resolveScope, type BackendScope } from "@/lib/backend";

export const runtime = "nodejs";

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

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rawPath =
    typeof payload?.path === "string"
      ? payload.path
      : typeof payload?.nextcloudPath === "string"
        ? payload.nextcloudPath
        : null;
  if (!rawPath) {
    return NextResponse.json({ error: "path is required" }, { status: 422 });
  }

  const normalized = normalizeNextcloudPath(rawPath);

  try {
    const result = await triggerIngestFromNextcloud(scope, normalized);
    return NextResponse.json({ ok: true, path: normalized, ingest: result });
  } catch (error) {
    if (error instanceof NextcloudConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "reindex_failed", detail: message },
      { status: 502 },
    );
  }
}
