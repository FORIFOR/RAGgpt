"use client";

import type { NotebookMeta } from "@/lib/notebookMeta";

export type NotebookInfoCardProps = {
  meta: NotebookMeta;
  fallbackPath: string;
  onEdit: () => void;
};

export function NotebookInfoCard({ meta, fallbackPath, onEdit }: NotebookInfoCardProps) {
  const folder = meta.nextcloudPath || fallbackPath;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Notebook</p>
          <p className="text-lg font-semibold text-slate-900">{meta.title}</p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          Notebook設定
        </button>
      </div>
      {meta.description ? (
        <p className="mt-2 text-sm text-slate-600">{meta.description}</p>
      ) : null}
      <dl className="mt-3 space-y-1 text-xs text-slate-500">
        <div className="flex items-center justify-between gap-2">
          <dt>Nextcloudフォルダ</dt>
          <dd className="truncate font-mono text-[11px] text-slate-600">{folder}</dd>
        </div>
      </dl>
      {meta.nextcloudUrl ? (
        <a
          href={meta.nextcloudUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:underline"
        >
          Nextcloudで開く ↗
        </a>
      ) : null}
    </section>
  );
}
