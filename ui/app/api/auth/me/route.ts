import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { extractTokenFromCookie, verifyToken } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET() {
  const token = extractTokenFromCookie(cookies());
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ email: payload.email, name: payload.name });
}
