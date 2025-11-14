import { NextResponse } from "next/server";

export async function GET() {
  let lmstudio_up = false;
  try {
    const res = await fetch("http://host.docker.internal:1234/v1/models", { cache: "no-store" });
    lmstudio_up = res.ok;
  } catch {}
  return NextResponse.json({ lmstudio_up });
}

