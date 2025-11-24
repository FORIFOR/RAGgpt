import { NextResponse } from "next/server";

import { clearTokenCookie } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(clearTokenCookie());
  return res;
}
