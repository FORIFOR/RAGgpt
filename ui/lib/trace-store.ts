import { create } from "zustand";

export type TraceEvent =
  | { t: number; type: "request_start"; method: string; url: string; bodyBytes: number; clientTraceId: string }
  | { t: number; type: "response_headers"; status: number; requestId?: string }
  | { t: number; type: "sse_status"; phase: "retrieval" | "generation_start"; candidates?: number }
  | { t: number; type: "sse_token"; token: string; bytes: number }
  | { t: number; type: "sse_llm_meta"; llm: any }
  | { t: number; type: "sse_final"; citations: any[]; sources: any[]; llm?: any }
  | { t: number; type: "done" }
  | { t: number; type: "error"; message: string };

export type Trace = {
  id: string;
  label?: string;
  startedAt: number;
  events: TraceEvent[];
};

type State = {
  traces: Record<string, Trace>;
  newTrace: (label?: string) => string;
  addEvent: (id: string, ev: TraceEvent) => void;
  clear: () => void;
};

function now() {
  return performance.now();
}

export const useTraceStore = create<State>((set) => ({
  traces: {},
  newTrace: (label) => {
    const id = crypto.randomUUID();
    set((s) => ({
      traces: { ...s.traces, [id]: { id, label, startedAt: now(), events: [] } }
    }));
    return id;
  },
  addEvent: (id, ev) =>
    set((s) => {
      const trace = s.traces[id];
      if (!trace) return s;
      return {
        traces: {
          ...s.traces,
          [id]: { ...trace, events: [...trace.events, ev] }
        }
      };
    }),
  clear: () => set({ traces: {} }),
}));

// 便利: コンソールにもきれいに出す（グループ化）
export function flushToConsole(id: string) {
  const trace = useTraceStore.getState().traces[id];
  if (!trace) return;
  console.groupCollapsed(`RAG trace ${id} ${trace.label ? `(${trace.label})` : ""}`);
  for (const e of trace.events) console.log(e);
  console.groupEnd();
}
