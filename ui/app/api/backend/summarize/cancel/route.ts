import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAG_BASE =
  process.env.RAG_SERVER_URL ??
  process.env.RAG_API_BASE ??
  process.env.RAG_BASE_URL ??
  "http://127.0.0.1:3002";
const API_KEY = process.env.RAG_API_KEY || process.env.API_KEY || "";

export async function POST(req: NextRequest) {
  const body = await req
    .json()
    .catch(() => ({ job_id: req.nextUrl.searchParams.get("job_id") }));

  const jobId = body.job_id;
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ error: "job_id required" }, { status: 422 });
  }

  try {
    const upstream = await fetch(
      `${RAG_BASE}/summarize/cancel/${encodeURIComponent(jobId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY
            ? { Authorization: `Bearer ${API_KEY}`, "x-api-key": API_KEY }
            : {}),
        },
        cache: "no-store",
      },
    );
    const text = await upstream.text().catch(() => "{}");
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: err.message || "cancel_failed" },
      { status: 502 },
    );
  }
}
