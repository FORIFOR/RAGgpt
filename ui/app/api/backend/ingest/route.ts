import { NextRequest, NextResponse } from "next/server";
import { filterProxyHeaders, resolveScope } from "@/lib/backend";

const RAG_BASE =
  process.env.NEXT_PUBLIC_RAG_API_BASE ||
  process.env.RAG_SERVER_URL ||
  process.env.RAG_API_BASE ||
  "http://127.0.0.1:3002";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || process.env.RAG_API_KEY || process.env.API_KEY || "";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const scope = resolveScope(req.nextUrl);
  const upstreamUrl = `${RAG_BASE.replace(/\/$/, "")}/ingest?tenant=${encodeURIComponent(scope.tenant)}`;

  const headers = new Headers(req.headers);
  headers.set("x-tenant", scope.tenant);
  headers.set("x-user-id", scope.user_id);
  headers.set("x-notebook-id", scope.notebook_id);
  headers.delete("content-length");
  if (API_KEY) {
    headers.set("authorization", `Bearer ${API_KEY}`);
    headers.set("x-api-key", API_KEY);
  }

  const resp = await fetch(upstreamUrl, {
    method: "POST",
    headers,
    body: req.body,
    // @ts-expect-error Node.js specific option for streamed uploads
    duplex: "half",
  });

  return new NextResponse(resp.body, {
    status: resp.status,
    headers: filterProxyHeaders(resp.headers),
  });
}
