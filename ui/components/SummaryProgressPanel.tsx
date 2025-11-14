"use client";

import clsx from "clsx";

import type { SummaryJobSnapshot } from "@/lib/summary-job";

type SummaryProgressPanelProps = {
  job: SummaryJobSnapshot;
  onCancel?: () => void;
  disabled?: boolean;
};

const SEGMENTS: Array<{ id: "retrieval" | "map" | "reduce"; label: string; weight: number }> = [
  { id: "retrieval", label: "検索 (Retrieval)", weight: 0.1 },
  { id: "map", label: "分割要約 (Map)", weight: 0.7 },
  { id: "reduce", label: "統合 (Reduce)", weight: 0.2 },
];

const SEGMENT_OFFSETS: Record<string, number> = {};
SEGMENTS.reduce((offset, segment) => {
  SEGMENT_OFFSETS[segment.id] = offset;
  return offset + segment.weight;
}, 0);

const PHASE_LABELS: Record<string, string> = {
  queue: "待機中",
  retrieval: "検索中",
  map: "分割要約",
  reduce: "統合要約",
  done: "完了",
  error: "エラー",
};

function clampProgress(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function formatMs(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  if (value < 1000) return `${Math.round(value)}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m${remainder.toString().padStart(2, "0")}s`;
}

function formatTokens(tokens?: number, tps?: number) {
  if (typeof tokens !== "number" || Number.isNaN(tokens)) return "-";
  const speed = typeof tps === "number" && !Number.isNaN(tps) ? `${tps.toFixed(1)} tok/s` : "";
  return `${tokens} tok${speed ? ` @ ${speed}` : ""}`;
}

function segmentFill(segmentId: "retrieval" | "map" | "reduce", normalizedProgress: number) {
  const start = SEGMENT_OFFSETS[segmentId];
  const width = SEGMENTS.find((segment) => segment.id === segmentId)?.weight ?? 0;
  if (width === 0) return 0;
  if (normalizedProgress <= start) return 0;
  if (normalizedProgress >= start + width) return 1;
  return (normalizedProgress - start) / width;
}

export function SummaryProgressPanel({ job, onCancel, disabled }: SummaryProgressPanelProps) {
  const progress = clampProgress(job.progress);
  const normalized = progress / 100;
  const phase = job.phase ?? "queue";
  const statusLabel = PHASE_LABELS[phase] ?? "進行中";
  const metrics = job.metrics ?? {};
  const mapMetrics = metrics.map ?? {};
  const genMetrics = metrics.gen ?? {};
  const elapsedMs = metrics.elapsed_ms ??
    (typeof job.startedAt === "number" && typeof job.updatedAt === "number"
      ? Math.max(0, job.updatedAt - job.startedAt)
      : undefined);

  const metricRows = [
    { label: "経過時間", value: elapsedMs !== undefined ? formatMs(elapsedMs) : null },
    { label: "検索", value: metrics.retrieval_ms !== undefined ? formatMs(metrics.retrieval_ms) : null },
    { label: "埋め込み", value: metrics.embed_ms !== undefined ? formatMs(metrics.embed_ms) : null },
    { label: "ベクター", value: metrics.vector_ms !== undefined ? formatMs(metrics.vector_ms) : null },
    { label: "BM25", value: metrics.bm25_ms !== undefined ? formatMs(metrics.bm25_ms) : null },
    { label: "再ランク", value: metrics.rerank_ms !== undefined ? formatMs(metrics.rerank_ms) : null },
    {
      label: "Map",
      value:
        mapMetrics.total !== undefined
          ? `${mapMetrics.done ?? 0}/${mapMetrics.total}${
              mapMetrics.last_ms !== undefined ? ` (${formatMs(mapMetrics.last_ms)})` : ""
            }`
          : null,
    },
    {
      label: "生成",
      value:
        genMetrics.tokens !== undefined
          ? `${genMetrics.stage ? `${genMetrics.stage}: ` : ""}${formatTokens(
              genMetrics.tokens,
              genMetrics.tps,
            )}`
          : null,
    },
    {
      label: "モデル",
      value: genMetrics.model ?? null,
    },
  ].filter((row) => row.value && row.value !== "-");

  return (
    <div className="border-t border-slate-200 bg-amber-50/70 px-6 py-3 text-sm text-slate-800">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[13px] font-semibold text-slate-700">
            要約処理中 — {statusLabel} ({progress.toFixed(0)}%)
          </p>
          {job.hint ? (
            <p className="text-[12px] text-amber-700">{job.hint}</p>
          ) : null}
        </div>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="inline-flex items-center justify-center rounded border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
        ) : null}
      </div>

      <div className="mt-3 space-y-1">
        <div className="h-2 rounded-full bg-white/60">
          <div
            className="h-2 rounded-full bg-amber-500 transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
          {SEGMENTS.map((segment) => {
            const fill = segmentFill(segment.id, normalized);
            const isActive = phase === segment.id;
            const isComplete = normalized >= SEGMENT_OFFSETS[segment.id] + segment.weight;
            return (
              <div key={segment.id} className="flex items-center gap-1">
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    isActive
                      ? "bg-amber-200 text-amber-900"
                      : isComplete
                      ? "bg-green-100 text-green-800"
                      : "bg-white/70 text-slate-500",
                  )}
                >
                  {segment.label}
                </span>
                <span className="w-12 overflow-hidden rounded-full bg-white/70">
                  <span
                    className="block h-1 bg-amber-500"
                    style={{ width: `${Math.max(0, Math.min(100, fill * 100))}%` }}
                  />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {metricRows.length > 0 ? (
        <div className="mt-3 grid gap-2 text-[12px] text-slate-600 sm:grid-cols-2">
          {metricRows.map((row) => (
            <div key={`${row.label}-${row.value}`} className="rounded border border-white/80 bg-white/60 px-2 py-1">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                {row.label}
              </div>
              <div className="font-semibold text-slate-800">{row.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {job.error ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          エラー: {job.error}
        </div>
      ) : null}
    </div>
  );
}
