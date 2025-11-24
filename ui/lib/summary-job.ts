import type { Scope } from "./scope";

export type SummaryJobPhase =
  | "queue"
  | "retrieval"
  | "map"
  | "reduce"
  | "done"
  | "error";

export type SummaryMapMetrics = {
  done?: number;
  total?: number;
  avg_ms?: number;
  last_ms?: number;
};

export type SummaryGenMetrics = {
  stage?: string;
  tokens?: number;
  tps?: number;
  avg_tok_ms?: number;
  model?: string;
};

export type SummaryJobMetrics = {
  retrieval_ms?: number;
  embed_ms?: number;
  vector_ms?: number;
  bm25_ms?: number;
  rerank_ms?: number;
  elapsed_ms?: number;
  map?: SummaryMapMetrics;
  gen?: SummaryGenMetrics;
  [key: string]: unknown;
};

export type SummaryJobSnapshot = {
  id: string;
  messageId: string;
  status?: string;
  phase?: SummaryJobPhase;
  progress?: number;
  startedAt?: number;
  updatedAt?: number;
  metrics?: SummaryJobMetrics;
  partialText?: string;
  hint?: string;
  error?: string;
  scope?: Scope;
};
