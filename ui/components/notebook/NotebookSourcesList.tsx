"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api";

export type NotebookDocument = {
  doc_id: string;
  title?: string;
  file_name?: string;
  source_file_path?: string;
  metadata?: Record<string, any>;
};

export type NotebookSourcesListProps = {
  documents: NotebookDocument[];
  selected: Set<string>;
  onToggle: (docId: string) => void;
  onRefresh?: () => void;
};

export function NotebookSourcesList({ documents, selected, onToggle, onRefresh }: NotebookSourcesListProps) {
  const rows = useMemo(() => documents.map((doc) => buildRow(doc)), [documents]);

  const handleReindex = useCallback(
    async (row: NotebookSourceRow) => {
      try {
        await apiFetch("/api/backend/files/reindex", {
          method: "POST",
          body: { path: row.nextcloudPath || row.sourcePath },
        });
        toast.success("インデックスを再実行しました");
        onRefresh?.();
      } catch (error) {
        console.error(error);
        toast.error("再実行に失敗しました");
      }
    },
    [onRefresh],
  );

  const handleRemove = useCallback(
    async (row: NotebookSourceRow) => {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(`${row.displayName} をこのNotebookから除外しますか？`);
        if (!confirmed) return;
      }
      try {
        await apiFetch(`/api/backend/documents/${encodeURIComponent(row.doc.doc_id)}`, {
          method: "DELETE",
        });
        toast.success("除外しました");
        onRefresh?.();
      } catch (error) {
        console.error(error);
        toast.error("除外に失敗しました");
      }
    },
    [onRefresh],
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        まだこの Notebook には資料が紐付いていません。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const isSelected = selected.has(row.doc.doc_id);
        return (
          <div
            key={row.doc.doc_id}
            className={`rounded-2xl border p-3 shadow-sm ${isSelected ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white"}`}
          >
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(row.doc.doc_id)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-sm font-semibold text-slate-900" title={row.displayName}>
                    {row.displayName}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                    {row.typeLabel}
                  </span>
                  <span className={`text-[11px] font-semibold ${row.statusColor}`}>{row.status}</span>
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">{row.sourcePath}</div>
                <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-500">
                  <span>{row.sizeLabel}</span>
                  <span>{row.updatedLabel}</span>
                </div>
              </div>
            </label>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {row.nextcloudUrl ? (
                <a
                  href={row.nextcloudUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:border-slate-300"
                >
                  Nextcloudで開く
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => void handleReindex(row)}
                className="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:border-slate-300"
              >
                インデックス再実行
              </button>
              <button
                type="button"
                onClick={() => void handleRemove(row)}
                className="rounded border border-rose-200 px-2 py-1 text-rose-600 hover:border-rose-300"
              >
                Notebookから除外
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type NotebookSourceRow = ReturnType<typeof buildRow>;

function buildRow(doc: NotebookDocument) {
  const metadata = doc.metadata || {};
  const fileName = metadata.file_name || doc.file_name || doc.title || doc.doc_id;
  const sourcePath = metadata.nextcloud_path || metadata.source || doc.source_file_path || fileName;
  const typeLabel = detectFileType(metadata.mime_type, fileName);
  const statusInfo = detectStatus(metadata.index_status || metadata.status);
  const updatedLabel = formatDate(metadata.updated_at || metadata.last_ingest_ts);
  const sizeLabel = formatBytes(metadata.size_bytes || metadata.file_size);
  const nextcloudUrl = buildNextcloudUrl(metadata.nextcloud_path || doc.source_file_path);
  return {
    doc,
    displayName: fileName,
    sourcePath,
    typeLabel,
    status: statusInfo.label,
    statusColor: statusInfo.color,
    updatedLabel,
    sizeLabel,
    nextcloudPath: metadata.nextcloud_path,
    nextcloudUrl,
  };
}

function detectFileType(mime?: string, name?: string) {
  const lower = (mime || name || "").toLowerCase();
  if (lower.includes("pdf")) return "PDF";
  if (lower.includes("word") || lower.endsWith(".doc") || lower.endsWith(".docx")) return "Word";
  if (lower.includes("ppt") || lower.endsWith(".ppt") || lower.endsWith(".pptx")) return "PowerPoint";
  if (lower.includes("xls") || lower.includes("sheet") || lower.endsWith(".xlsx")) return "Spreadsheet";
  if (lower.includes("markdown") || lower.endsWith(".md")) return "Markdown";
  if (lower.includes("txt")) return "Text";
  return "その他";
}

function detectStatus(raw?: string) {
  const value = (raw || "").toLowerCase();
  if (!value) return { label: "利用可能", color: "text-emerald-600" };
  if (value.includes("error") || value.includes("fail")) {
    return { label: "エラー", color: "text-rose-600" };
  }
  if (value.includes("pending") || value.includes("queue")) {
    return { label: "インデックス待ち", color: "text-amber-600" };
  }
  if (value.includes("index")) {
    return { label: "インデックス中", color: "text-sky-600" };
  }
  return { label: "利用可能", color: "text-emerald-600" };
}

function formatDate(value?: number) {
  if (!value) return "更新日時不明";
  const ts = value > 1e12 ? value : value * 1000;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "更新日時不明";
  return date.toLocaleString();
}

function formatBytes(bytes?: number) {
  if (!bytes) return "サイズ不明";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

const NEXTCLOUD_PUBLIC_BASE = process.env.NEXT_PUBLIC_NEXTCLOUD_BASE_URL?.replace(/\/$/, "");

function buildNextcloudUrl(path?: string) {
  if (!path || !NEXTCLOUD_PUBLIC_BASE) return null;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = new URL("/apps/files/", NEXTCLOUD_PUBLIC_BASE);
  const dir = normalized.split("/").slice(0, -1).join("/") || "/";
  url.searchParams.set("dir", dir.startsWith("/") ? dir : `/${dir}`);
  const file = normalized.split("/").pop();
  if (file) {
    url.hash = `scrollto=${encodeURIComponent(file)}`;
  }
  return url.toString();
}
