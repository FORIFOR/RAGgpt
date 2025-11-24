"use client";

import { useEffect, useState } from "react";

import type { NotebookMeta } from "@/lib/notebookMeta";

export type NotebookSettingsDialogProps = {
  open: boolean;
  meta: NotebookMeta;
  fallbackPath: string;
  onSave: (values: { title?: string; description?: string; nextcloudPath?: string; nextcloudUrl?: string }) => void;
  onClose: () => void;
  onPickFolder?: () => void;
  selectedFolder?: string;
};

export function NotebookSettingsDialog({
  open,
  meta,
  fallbackPath,
  onSave,
  onClose,
  onPickFolder,
  selectedFolder,
}: NotebookSettingsDialogProps) {
  const [title, setTitle] = useState(meta.title);
  const [description, setDescription] = useState(meta.description || "");
  const [folder, setFolder] = useState(meta.nextcloudPath || fallbackPath);
  const [nextcloudUrl, setNextcloudUrl] = useState(meta.nextcloudUrl || "");

  useEffect(() => {
    if (!open) return;
    setTitle(meta.title);
    setDescription(meta.description || "");
    setFolder(meta.nextcloudPath || fallbackPath);
    setNextcloudUrl(meta.nextcloudUrl || "");
  }, [open, meta, fallbackPath]);

  useEffect(() => {
    if (open && selectedFolder) {
      setFolder(selectedFolder);
    }
  }, [open, selectedFolder]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Notebook設定</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500">Notebook名</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">説明</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={3}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Nextcloudフォルダ</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={onPickFolder}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100"
              >
                ライブラリから
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Nextcloud URL (任意)</label>
            <input
              type="url"
              value={nextcloudUrl}
              onChange={(event) => setNextcloudUrl(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="https://cloud.example.jp/apps/files/?dir=/RAG/..."
            />
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => {
              onSave({ title, description, nextcloudPath: folder, nextcloudUrl });
            }}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
