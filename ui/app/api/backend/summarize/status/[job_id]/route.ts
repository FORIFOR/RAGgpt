import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAG_BASE =
  process.env.RAG_SERVER_URL ??
  process.env.RAG_API_BASE ??
  process.env.RAG_BASE_URL ??
  "http://127.0.0.1:3002";
const API_KEY = process.env.RAG_API_KEY || process.env.API_KEY || "";
const REQUEST_TIMEOUT_MS = Number(
  process.env.RAG_SUMMARY_STATUS_TIMEOUT_MS ?? "45000",
);

type RouteContext = {
  params?: {
    job_id?: string;
  };
};

export async function GET(req: NextRequest, context: RouteContext) {
  const jobId =
    context.params?.job_id || req.nextUrl.searchParams.get("job_id");

  if (!jobId) {
    return NextResponse.json({ error: "job_id required" }, { status: 422 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (typeof (timeout as NodeJS.Timeout).unref === "function") {
    (timeout as NodeJS.Timeout).unref();
  }

  try {
    const upstream = await fetch(
      `${RAG_BASE}/summarize/status/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        headers: {
          ...(API_KEY
            ? { Authorization: `Bearer ${API_KEY}`, "x-api-key": API_KEY }
            : {}),
        },
        cache: "no-store",
        signal: controller.signal,
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
    const status = err.name === "AbortError" ? 504 : 502;
    return NextResponse.json(
      { error: err.message || "summarize_status_failed" },
      { status },
    );
  } finally {
    clearTimeout(timeout);
  }
}
