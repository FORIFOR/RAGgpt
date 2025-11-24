import { NextResponse } from "next/server";

import { getNextcloudSettings, NextcloudConfigError } from "@/lib/nextcloud";

export const runtime = "nodejs";

export async function GET() {
  try {
    const settings = getNextcloudSettings();
    return NextResponse.json({
      ok: true,
      baseUrl: maskSensitive(settings.webdavBaseUrl),
      ragFolder: settings.ragFolder,
      timeoutMs: settings.timeoutMs,
    });
  } catch (error) {
    if (error instanceof NextcloudConfigError) {
      return NextResponse.json({ ok: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message });
  }
}

function maskSensitive(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const maskedAuth = url.username ? `${url.username}@` : "";
    return `${url.protocol}//${maskedAuth}${url.host}${url.pathname}`;
  } catch {
    return value;
  }
}
