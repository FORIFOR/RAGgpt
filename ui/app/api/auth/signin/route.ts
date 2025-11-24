import { NextResponse } from "next/server";

import { findUser, verifyPassword, buildTokenCookie } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "メールアドレスとパスワードを入力してください" },
      { status: 422 },
    );
  }

  const user = findUser(email);
  if (!user || !verifyPassword(password, user)) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  const cookie = buildTokenCookie({ email: user.email, name: user.name });
  const res = NextResponse.json({ email: user.email, name: user.name });
  res.cookies.set(cookie);
  return res;
}
