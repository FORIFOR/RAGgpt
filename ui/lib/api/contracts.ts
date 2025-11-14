/**
 * API contracts with Zod schema validation
 * Ensures type safety between client and mcp-rag-server
 */
import { z } from "zod";

// ============================================================================
// Search API Contract
// ============================================================================

export const SearchRequestSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).default(40),
  with_context: z.boolean().default(true),
  context_size: z.number().int().nonnegative().default(1),
  retriever: z.enum(["mcp", "local-hybrid"]).default("mcp"),
  rerank: z.boolean().default(false),
  tenant: z.string(),
  notebook: z.string(),
  user_id: z.string(),
  notebook_id: z.string(),
  include_global: z.boolean().default(false),
});

export type SearchRequest = z.infer<typeof SearchRequestSchema>;

const SearchHitSchema = z.object({
  type: z.literal("hit"),
  file: z.string(),
  chunk: z.number(),
  score: z.number(),
  snippet: z.string(),
  context_before: z.string().optional(),
  context_after: z.string().optional(),
  page: z.number().optional(),
  title: z.string().optional(),
});

const SearchTextSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const SearchResponseSchema = z.object({
  result: z.object({
    content: z.array(z.union([SearchTextSchema, SearchHitSchema])),
  }),
  retriever_used: z.enum(["mcp", "local-hybrid"]).optional(),
  latency_ms: z.number().optional(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type SearchHit = z.infer<typeof SearchHitSchema>;

// ============================================================================
// Generate API Contract (SSE)
// ============================================================================

export const GenerateRequestSchema = z.object({
  query: z.string().min(1),
  hits: z.array(SearchHitSchema).default([]),
  provider: z.enum(["ollama", "openai", "gemini", "anthropic"]).default("ollama"),
  profile: z.enum(["quiet", "balanced", "max"]).default("balanced"),
  tenant: z.string(),
  notebook: z.string(),
  user_id: z.string(),
  notebook_id: z.string(),
  include_global: z.boolean().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

// SSE Event types
export const SSEStatusEventSchema = z.object({
  event: z.literal("status"),
  data: z.object({
    phase: z.enum(["retrieval", "rerank", "generation_start", "generation_done"]),
    candidates: z.number().optional(),
    latency_ms: z.number().optional(),
  }),
});

export const SSEDataEventSchema = z.object({
  event: z.literal("data"),
  data: z.object({
    token: z.string(),
    usage: z
      .object({
        prompt_tokens: z.number().optional(),
        completion_tokens: z.number().optional(),
        total_tokens: z.number().optional(),
      })
      .optional(),
  }),
});

export const SSECitationEventSchema = z.object({
  event: z.literal("citation"),
  data: z.object({
    index: z.number(),
    file: z.string(),
    chunk: z.number(),
    score: z.number().optional(),
  }),
});

export const SSEDoneEventSchema = z.object({
  event: z.literal("done"),
  data: z.object({
    total_tokens: z.number().optional(),
    latency_ms: z.number().optional(),
  }),
});

export const SSEErrorEventSchema = z.object({
  event: z.literal("error"),
  data: z.object({
    message: z.string(),
    code: z.string().optional(),
  }),
});

export const SSEEventSchema = z.union([
  SSEStatusEventSchema,
  SSEDataEventSchema,
  SSECitationEventSchema,
  SSEDoneEventSchema,
  SSEErrorEventSchema,
]);

export type SSEEvent = z.infer<typeof SSEEventSchema>;

// ============================================================================
// Health API Contract
// ============================================================================

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  ms: z.number(),
  status: z.enum(["healthy", "degraded", "down"]),
  service: z.string(),
  error: z.string().optional(),
  details: z
    .object({
      version: z.string().optional(),
      uptime: z.number().optional(),
      docs_count: z.number().optional(),
    })
    .optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ============================================================================
// Library/Preview API Contract
// ============================================================================

export const PreviewRequestSchema = z.object({
  file: z.string(),
  chunk: z.number().int().nonnegative(),
  highlight: z.string().optional(),
});

export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;

export const PreviewResponseSchema = z.object({
  file: z.string(),
  chunk: z.number(),
  content: z.string(),
  context_before: z.string().optional(),
  context_after: z.string().optional(),
  metadata: z
    .object({
      page: z.number().optional(),
      title: z.string().optional(),
      source_uri: z.string().optional(),
    })
    .optional(),
});

export type PreviewResponse = z.infer<typeof PreviewResponseSchema>;
