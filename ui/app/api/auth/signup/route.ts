import { NextResponse } from "next/server";

import { createUser, findUser, saveUsers, loadUsers, buildTokenCookie } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name.trim() : email.split("@")[0] || "user";

  if (!email || !password || password.length < 6) {
    return NextResponse.json(
      { error: "メールアドレスと6文字以上のパスワードが必要です" },
      { status: 422 },
    );
  }
  if (!email.includes("@")) {
    return NextResponse.json({ error: "有効なメールアドレスを入力してください" }, { status: 422 });
  }

  const existing = findUser(email);
  if (existing) {
    return NextResponse.json({ error: "このメールアドレスは既に登録されています" }, { status: 409 });
  }

  const user = createUser(email, password, name);
  const users = loadUsers().filter((u) => u.email.toLowerCase() !== email.toLowerCase());
  users.push(user);
  saveUsers(users);

  const cookie = buildTokenCookie({ email: user.email, name: user.name });
  const res = NextResponse.json({ email: user.email, name: user.name });
  res.cookies.set(cookie);
  return res;
}
