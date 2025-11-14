"use client";
import { useMemo, useState } from "react";
import { useTraceStore, TraceEvent } from "@/lib/trace-store";

function ms(n: number) {
  return `${n.toFixed(1)} ms`;
}

export default function DebugPane() {
  const traces = useTraceStore((s) => s.traces);
  const [open, setOpen] = useState(true);
  const [minimized, setMinimized] = useState(false);

  const items = useMemo(
    () => Object.values(traces).sort((a, b) => b.startedAt - a.startedAt),
    [traces]
  );

  if (minimized) {
    return (
      <div className="fixed bottom-3 right-3 bg-white/95 border rounded-lg shadow-xl px-4 py-2">
        <button
          className="text-sm font-semibold hover:text-blue-600"
          onClick={() => setMinimized(false)}
        >
          RAG Debug ({items.length})
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 w-[640px] max-h-[70vh] overflow-auto bg-white/95 border rounded-2xl shadow-xl">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50">
        <div className="font-semibold text-slate-900">RAG Debug</div>
        <div className="flex items-center space-x-2">
          <button
            className="text-xs underline text-slate-600 hover:text-slate-900"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "collapse" : "expand"}
          </button>
          <button
            className="text-xs underline text-slate-600 hover:text-slate-900"
            onClick={() => setMinimized(true)}
          >
            minimize
          </button>
        </div>
      </div>
      {!open ? null : (
        <div className="divide-y max-h-[calc(70vh-48px)] overflow-auto">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No traces yet. Make a RAG request to see debug info.
            </div>
          ) : (
            items.map((t) => <TraceCard key={t.id} traceId={t.id} />)
          )}
        </div>
      )}
    </div>
  );
}

function TraceCard({ traceId }: { traceId: string }) {
  const trace = useTraceStore((s) => s.traces[traceId]);
  if (!trace) return null;

  // 導出メトリクス
  const started = trace.startedAt;
  const ev = trace.events;

  const tReq = ev.find((e) => e.type === "request_start")?.t ?? started;
  const tHdr = ev.find((e) => e.type === "response_headers")?.t ?? tReq;
  const tRet = ev.find((e) => e.type === "sse_status" && e.phase === "retrieval")?.t;
  const tGen = ev.find((e) => e.type === "sse_status" && e.phase === "generation_start")?.t;
  const tDone = ev.find((e) => e.type === "done")?.t ?? (ev.at(-1)?.t ?? started);

  const total = tDone - tReq;
  const network = tHdr - tReq;
  const retrieval = tGen && tRet ? tGen - tRet : undefined;
  const gen = tGen ? tDone - tGen : undefined;

  const serverRid = (ev.find((e) => e.type === "response_headers") as any)?.requestId as string | undefined;
  const candidates = (ev.find((e) => e.type === "sse_status" && e.phase === "retrieval") as any)?.candidates as
    | number
    | undefined;

  const tokens = ev.filter((e) => e.type === "sse_token").length;
  const bytes = ev.filter((e) => e.type === "sse_token").reduce((s, e: any) => s + (e.bytes || 0), 0);

  const tps = gen ? tokens / (gen / 1000) : undefined;
  const kbps = gen ? bytes / 1024 / (gen / 1000) : undefined;

  const hasError = ev.some((e) => e.type === "error");

  return (
    <details open className="px-4 py-3">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center gap-2 mb-1">
          <div className="font-medium text-slate-900">{trace.label ?? "trace"}</div>
          <div className="text-xs text-slate-400">
            id: {trace.id.slice(0, 8)}…{trace.id.slice(-4)}
          </div>
          {serverRid && <div className="text-xs text-slate-400">rid: {serverRid}</div>}
          {hasError && (
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">ERROR</span>
          )}
        </div>
        <div className="text-xs text-slate-600">
          <span className="font-medium">total {ms(total)}</span> · hdr {ms(network)}
          {retrieval !== undefined && <> · retrieval {ms(retrieval)}</>}
          {gen !== undefined && <> · gen {ms(gen)}</>}
          {tokens > 0 && <> · {tokens} tokens</>}
          {tps !== undefined && <> · {tps.toFixed(1)} tok/s</>}
          {kbps !== undefined && <> · {kbps.toFixed(1)} KB/s</>}
          {candidates !== undefined && <> · {candidates} candidates</>}
        </div>
      </summary>

      <div className="mt-3 bg-slate-50 rounded-lg p-3 text-xs max-h-64 overflow-auto font-mono">
        {trace.events.map((e, i) => (
          <EventRow key={i} e={e} base={tReq} />
        ))}
      </div>
    </details>
  );
}

function EventRow({ e, base }: { e: TraceEvent; base: number }) {
  const colorClass = e.type === "error" ? "text-red-600" : e.type === "done" ? "text-green-600" : "text-slate-700";
  const bgClass = e.type === "error" ? "bg-red-50" : "";

  return (
    <div className={`grid grid-cols-[80px_140px_1fr] gap-2 py-1 ${bgClass} rounded px-1`}>
      <div className="text-slate-500">+{ms(e.t - base)}</div>
      <div className={`font-semibold ${colorClass}`}>{e.type}</div>
      <div className="truncate text-slate-600">{short(JSON.stringify(e))}</div>
    </div>
  );
}

function short(s: string, n = 100) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
