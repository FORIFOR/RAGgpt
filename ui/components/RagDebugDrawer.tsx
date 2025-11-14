"use client";
import { useEffect, useState } from "react";
import { X, Bug } from "lucide-react";

type RagEvent = {
  timestamp: number;
  type: string;
  phase?: string;
  candidates?: number;
  tokens?: number;
  merged?: any[];
  bm25_score?: number;
  vector_score?: number;
  hybrid_score?: number;
  raw?: any;
};

/**
 * RAG Debug Drawer - Displays real-time SSE events and scoring details
 * Helps developers understand what's happening during RAG operations
 */
export function RagDebugDrawer() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<RagEvent[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const event: RagEvent = {
        timestamp: Date.now(),
        type: detail.type || "unknown",
        phase: detail.phase,
        candidates: detail.candidates,
        tokens: detail.tokens,
        merged: detail.merged,
        bm25_score: detail.bm25_score,
        vector_score: detail.vector_score,
        hybrid_score: detail.hybrid_score,
        raw: detail,
      };
      setEvents((prev) => [...prev, event].slice(-50)); // Keep last 50 events
    };

    window.addEventListener("__rag_event__", handler);
    return () => window.removeEventListener("__rag_event__", handler);
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center z-50"
        aria-label="Open RAG Debug Drawer"
      >
        <Bug className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-slate-900 text-slate-100 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-blue-400" />
          <h2 className="font-semibold">RAG Debug</h2>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded hover:bg-slate-800"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-700 text-xs">
        <button
          onClick={() => setEvents([])}
          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
        >
          Clear
        </button>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          <span>Auto-scroll</span>
        </label>
        <span className="text-slate-400">{events.length} events</span>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-auto p-4 space-y-2 font-mono text-xs">
        {events.length === 0 ? (
          <div className="text-slate-400 text-center py-8">
            No events yet. Start a RAG query to see debug info.
          </div>
        ) : (
          events.map((event, idx) => (
            <div
              key={idx}
              className={`p-3 rounded border ${
                event.type === "status"
                  ? "bg-blue-900/20 border-blue-700/50"
                  : event.type === "token"
                  ? "bg-green-900/20 border-green-700/50"
                  : event.type === "error"
                  ? "bg-red-900/20 border-red-700/50"
                  : "bg-slate-800/50 border-slate-700/50"
              }`}
            >
              {/* Timestamp */}
              <div className="text-slate-400 text-[10px] mb-1">
                {new Date(event.timestamp).toLocaleTimeString()}.
                {event.timestamp % 1000}
              </div>

              {/* Type & Phase */}
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    event.type === "status"
                      ? "bg-blue-600 text-white"
                      : event.type === "token"
                      ? "bg-green-600 text-white"
                      : event.type === "error"
                      ? "bg-red-600 text-white"
                      : "bg-slate-600 text-white"
                  }`}
                >
                  {event.type}
                </span>
                {event.phase && (
                  <span className="text-slate-300">{event.phase}</span>
                )}
              </div>

              {/* Metadata */}
              {event.candidates !== undefined && (
                <div className="text-blue-300">
                  Candidates: {event.candidates}
                </div>
              )}
              {event.tokens !== undefined && (
                <div className="text-green-300">Tokens: {event.tokens}</div>
              )}

              {/* Scoring (for merged results) */}
              {event.merged && event.merged.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-slate-400 text-[10px]">
                    Top {Math.min(3, event.merged.length)} results:
                  </div>
                  {event.merged.slice(0, 3).map((item: any, i: number) => (
                    <div key={i} className="pl-2 border-l border-slate-600">
                      <div className="text-slate-300">
                        [{i + 1}] {item.title || item.doc_id || "Unknown"}
                      </div>
                      {item.hybrid_score !== undefined && (
                        <div className="text-slate-400 text-[10px]">
                          Hybrid: {item.hybrid_score.toFixed(3)}
                          {item.bm25_score && (
                            <span className="ml-2">
                              BM25: {item.bm25_score.toFixed(3)}
                            </span>
                          )}
                          {item.vector_score && (
                            <span className="ml-2">
                              Vector: {item.vector_score.toFixed(3)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Raw data (collapsible) */}
              <details className="mt-2">
                <summary className="text-slate-400 text-[10px] cursor-pointer hover:text-slate-300">
                  Raw data
                </summary>
                <pre className="mt-1 p-2 bg-slate-950 rounded text-[9px] overflow-auto max-h-32">
                  {JSON.stringify(event.raw, null, 2)}
                </pre>
              </details>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
