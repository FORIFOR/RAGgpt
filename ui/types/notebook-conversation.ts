import type { SentenceSegment } from "@/lib/sentence-attribution";

export type NotebookCitation = {
  id?: string | number;
  doc_id?: string;
  title?: string;
  page?: number;
  uri?: string;
  snippet?: string;
  text?: string;
  quote?: string;
  anchor_phrase?: string | null;
  anchor_char_start?: number | null;
  anchor_char_end?: number | null;
};

export type NotebookMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: NotebookCitation[];
  segments?: SentenceSegment[];
  createdAt: number;
};
