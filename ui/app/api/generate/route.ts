import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = process.env.RAG_API_BASE || process.env.NEXT_PUBLIC_BACKEND_BASE || "http://rag-api:8000";
const API_KEY = process.env.RAG_API_KEY || process.env.NEXT_PUBLIC_API_KEY || process.env.API_KEY || "dev-secret-change-me";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    let tenant = url.searchParams.get("tenant") || req.headers.get("x-tenant") || null;
    
    // Body can come in various formats, be tolerant and map to expected format
    const raw = await req.json().catch(() => ({} as any));
    
    console.log(`[api/generate] Request URL: ${req.url}`);
    console.log(`[api/generate] Raw body keys:`, Object.keys(raw));
    
    // Extract tenant from body if not in query/header
    if (!tenant) {
      tenant = raw.notebookId || raw.tenant || null;
    }
    
    // Map various key names to expected API format
    const query = (raw.query ?? raw.userText ?? raw.text ?? "").toString().trim();
    const selected_ids = Array.isArray(raw.selected_ids) 
      ? raw.selected_ids 
      : Array.isArray(raw.selectedSourceIds) 
        ? raw.selectedSourceIds 
        : [];
    const history = Array.isArray(raw.history) ? raw.history : [];
    const streamEnabled = raw.stream ?? true;

    console.log(`[api/generate] Parsed - Tenant: "${tenant}", Query: "${query.slice(0, 50)}...", Selected IDs: ${selected_ids.length}`);

    if (!tenant) {
      console.error("[api/generate] 400 tenant missing", { url: req.url, bodyKeys: Object.keys(raw || {}) });
      return NextResponse.json({ 
        error: "tenant missing - テナント指定が必要です。URLにtenant=...を付けるか、ボディにnotebookId/tenantを含めてください" 
      }, { status: 400 });
    }
    
    if (!query || typeof query !== "string" || !query.trim()) {
      console.error("[api/generate] 400 query missing or empty", { query, bodyKeys: Object.keys(raw || {}) });
      return NextResponse.json({ 
        error: "query missing - 質問テキストが必要です。JSONが無効または改行で分割されている可能性があります" 
      }, { status: 400 });
    }

    const upstream = `${API_BASE.replace(/\/$/, "")}/generate?tenant=${encodeURIComponent(tenant)}`;
    console.log(`[api/generate] Forwarding to: ${upstream}`);
    
    // Normalize payload - empty selected_ids means "no constraints" so omit the key entirely
    const payload = {
      query,
      history,
      stream: streamEnabled,
      tenant,  // Include tenant in body as well
      // Only include selected_ids if it's a non-empty array (empty array = no constraints)
      ...(Array.isArray(selected_ids) && selected_ids.length > 0 
          ? { selected_ids } 
          : {}
      )
    };
    
    console.log(`[api/generate] Payload keys:`, Object.keys(payload), `selected_ids included: ${!!payload.selected_ids}`);
    
    const res = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "x-tenant": tenant,  // Include tenant in header as well
      },
      body: JSON.stringify(payload),
    });

    // Handle errors
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      console.warn(`[api/generate] Upstream error ${res.status}:`, text);
      return new Response(text || JSON.stringify({ error: `upstream ${res.status}` }), { 
        status: res.status || 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Create ReadableStream to properly pipe SSE
    const sseStream = new ReadableStream({
      start(controller) {
        const reader = res.body!.getReader();
        const pump = () =>
          reader.read().then(({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }
            controller.enqueue(value);
            pump();
          }).catch(err => {
            console.error('[api/generate] Stream error:', err);
            controller.error(err);
          });
        pump();
      }
    });

    return new Response(sseStream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
