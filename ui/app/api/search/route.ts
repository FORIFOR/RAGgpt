import { NextRequest } from "next/server";
import { SearchRequestSchema } from "@/lib/api/contracts";

export const dynamic = "force-dynamic";

const RAG_SERVER_URL = process.env.RAG_SERVER_URL ?? process.env.RAG_API_BASE ?? 'http://localhost:3002';
const API_KEY = process.env.RAG_API_KEY || process.env.NEXT_PUBLIC_API_KEY || process.env.API_KEY || 'dev-secret-change-me';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate request with Zod schema
    const validatedRequest = SearchRequestSchema.parse(body);

    // Proxy to mcp-rag-server
    const baseUrl = RAG_SERVER_URL.startsWith("/")
      ? `${req.nextUrl.origin}${RAG_SERVER_URL}`
      : RAG_SERVER_URL;

    const response = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "Authorization": `Bearer ${API_KEY}`,
        "x-tenant": validatedRequest.tenant,
        "x-notebook": validatedRequest.notebook,
        "x-user-id": validatedRequest.user_id,
      },
      body: JSON.stringify(validatedRequest),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return new Response(
        JSON.stringify({
          error: `search_failed ${response.status} ${errorText}`,
          result: { content: [] }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        }
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "x-request-id": response.headers.get("x-request-id") || "",
      }
    });
  } catch (error) {
    console.error("[API /search] Error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        result: { content: [] }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  }
}
