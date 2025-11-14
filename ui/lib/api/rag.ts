/**
 * RAG API high-level wrapper with fallback strategies
 * Orchestrates search → generation pipeline with automatic fallback
 */

import { postJSON, sseStream, APIError } from "./client";
import {
  SearchRequest,
  SearchResponse,
  SearchResponseSchema,
  GenerateRequest,
  SSEEvent,
} from "./contracts";
import { toast } from "sonner";

const API_BASE = "/api";

/**
 * Search with automatic fallback from MCP to local-hybrid
 */
export async function searchOrFallback(
  request: SearchRequest
): Promise<SearchResponse & { retriever_used: "mcp" | "local-hybrid" }> {
  const startTime = performance.now();

  try {
    // Try MCP first if requested
    if (request.retriever === "mcp") {
      try {
        const response = await postJSON<SearchResponse>(
          `${API_BASE}/search`,
          request,
          { timeout: 10000 }
        );

        const validated = SearchResponseSchema.parse(response);
        const latency = performance.now() - startTime;

        return {
          ...validated,
          retriever_used: "mcp",
          latency_ms: latency,
        };
      } catch (error) {
        // MCP failed, fall back to local-hybrid
        console.warn("[RAG] MCP search failed, falling back to local-hybrid:", error);

        toast.warning("MCP検索に失敗", {
          description: "ローカル検索にフォールバックします",
        });

        const fallbackRequest: SearchRequest = {
          ...request,
          retriever: "local-hybrid",
        };

        const response = await postJSON<SearchResponse>(
          `${API_BASE}/search`,
          fallbackRequest,
          { timeout: 10000 }
        );

        const validated = SearchResponseSchema.parse(response);
        const latency = performance.now() - startTime;

        return {
          ...validated,
          retriever_used: "local-hybrid",
          latency_ms: latency,
        };
      }
    }

    // Direct local-hybrid request
    const response = await postJSON<SearchResponse>(
      `${API_BASE}/search`,
      request,
      { timeout: 10000 }
    );

    const validated = SearchResponseSchema.parse(response);
    const latency = performance.now() - startTime;

    return {
      ...validated,
      retriever_used: "local-hybrid",
      latency_ms: latency,
    };
  } catch (error) {
    // Both methods failed
    if (error instanceof APIError) {
      toast.error("検索に失敗しました", {
        description: error.message,
      });
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    toast.error("検索に失敗しました", {
      description: errorMessage,
    });
    throw new APIError(errorMessage);
  }
}

/**
 * Generate stream with fallback to retrieval-only mode
 */
export async function* generateStream(
  request: GenerateRequest
): AsyncGenerator<SSEEvent> {
  try {
    for await (const { event, data } of sseStream<any>(
      `${API_BASE}/generate`,
      request,
      { timeout: 120000 }
    )) {
      yield { event, data } as SSEEvent;
    }
  } catch (error) {
    if (error instanceof APIError) {
      // If generation fails, fall back to showing retrieval results only
      console.warn("[RAG] Generation failed, falling back to retrieval-only:", error);

      toast.warning("生成に失敗しました", {
        description: "検索結果のみを表示します",
      });

      // Yield error event
      yield {
        event: "error",
        data: {
          message: error.message,
          code: error.code,
        },
      } as SSEEvent;
    } else {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      toast.error("生成に失敗しました", {
        description: errorMessage,
      });

      yield {
        event: "error",
        data: {
          message: errorMessage,
        },
      } as SSEEvent;
    }
  }
}

/**
 * Combined search + generate pipeline
 * Automatically handles the full RAG flow with fallbacks
 */
export async function* ragPipeline(params: {
  query: string;
  tenant?: string;
  notebook?: string;
  user_id?: string;
  notebook_id?: string;
  include_global?: boolean;
  retriever?: "mcp" | "local-hybrid";
  rerank?: boolean;
  provider?: "ollama" | "openai" | "gemini" | "anthropic";
  profile?: "quiet" | "balanced" | "max";
  limit?: number;
}): AsyncGenerator<
  | { type: "search"; data: SearchResponse; retriever_used: "mcp" | "local-hybrid" }
  | { type: "generate"; event: SSEEvent }
> {
  // Phase 1: Search
  yield* (async function* () {
    const tenant = params.tenant ?? "demo";
    const notebook = params.notebook ?? tenant;
    const userId = params.user_id ?? tenant;
    const notebookId = params.notebook_id ?? notebook;
    const includeGlobal = params.include_global ?? false;
    const searchRequest: SearchRequest = {
      query: params.query,
      limit: params.limit || 40,
      retriever: params.retriever || "mcp",
      rerank: params.rerank !== undefined ? params.rerank : false,
      tenant,
      notebook,
      with_context: true,
      context_size: 1,
      user_id: userId,
      notebook_id: notebookId,
      include_global: includeGlobal,
    };

    const searchResult = await searchOrFallback(searchRequest);

    yield {
      type: "search" as const,
      data: searchResult,
      retriever_used: searchResult.retriever_used,
    };

    // Phase 2: Generate (if hits found)
    const hits = searchResult.result.content.filter((item) => item.type === "hit");

    if (hits.length === 0) {
      toast.info("関連する資料が見つかりませんでした");
      return;
    }

    const generateRequest: GenerateRequest = {
      query: params.query,
      hits: hits as any[], // Type assertion for compatibility
      provider: params.provider || "ollama",
      profile: params.profile || "balanced",
      tenant,
      notebook,
      user_id: userId,
      notebook_id: notebookId,
      include_global: includeGlobal,
    };

    for await (const event of generateStream(generateRequest)) {
      yield {
        type: "generate" as const,
        event,
      };
    }
  })();
}
