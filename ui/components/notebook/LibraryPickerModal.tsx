"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import type { Scope } from "@/lib/api";
import { normalizeLibraryEntry, type FolderMeta, type LibraryFile } from "@/lib/library";
import { normalizeNextcloudPath } from "@/lib/nextcloud";
import { DEFAULT_TENANT, DEFAULT_USER } from "@/lib/scope";

const emptyEntries: LibraryFile[] = [];
const emptyFolders: FolderMeta[] = [];

type Mode = "folder" | "files";

export type LibraryPickerModalProps = {
  open: boolean;
  mode: Mode;
  initialPath?: string;
  scope?: Scope | null;
  onClose: () => void;
  onConfirm: (payload: { folder?: string; files?: LibraryFile[] }) => void;
};

export function LibraryPickerModal({
  open,
  mode,
  initialPath = "/",
  scope,
  onClose,
  onConfirm,
}: LibraryPickerModalProps) {
  const [currentPath, setCurrentPath] = useState(() => normalizeNextcloudPath(initialPath));
  const [entries, setEntries] = useState<LibraryFile[]>(emptyEntries);
  const [folders, setFolders] = useState<FolderMeta[]>(emptyFolders);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [identity, setIdentity] = useState(() => ({
    tenant: scope?.tenant ?? DEFAULT_TENANT,
    user: scope?.user_id ?? DEFAULT_USER,
  }));

  useEffect(() => {
    if (scope) {
      setIdentity({ tenant: scope.tenant, user: scope.user_id });
      return;
    }
    if (typeof window === "undefined") return;
    const tenant = window.sessionStorage.getItem("tenant")?.trim() || DEFAULT_TENANT;
    const user = window.sessionStorage.getItem("user_id")?.trim() || DEFAULT_USER;
    setIdentity({ tenant, user });
  }, [scope]);

  useEffect(() => {
    setCurrentPath(normalizeNextcloudPath(initialPath));
  }, [initialPath]);

  const filteredFiles = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) =>
      needle ? entry.original_name.toLowerCase().includes(needle) : true,
    );
  }, [entries, search]);

  const selectedFiles = useMemo(
    () => filteredFiles.filter((file) => selected[file.id]),
    [filteredFiles, selected],
  );

  const childFolders = useMemo(
    () => deriveChildFolders(folders, currentPath),
    [folders, currentPath],
  );

  const loadFolder = useCallback(
    async (path: string) => {
      const normalized = normalizeNextcloudPath(path);
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          path: normalized,
          tenant: identity.tenant,
          user_id: identity.user,
        });
        const response = await fetch(`/api/library/browse?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.detail || payload?.error || `HTTP ${response.status}`);
        }
        const normalizedEntries = Array.isArray(payload?.entries)
          ? payload.entries.map((entry: any) => normalizeLibraryEntry(entry))
          : [];
        if (Array.isArray(payload?.folders) && payload.folders.length > 0) {
          setFolders(payload.folders);
        }
        setEntries(normalizedEntries);
        setCurrentPath(payload?.path || normalized);
        setSelected({});
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [identity],
  );

  useEffect(() => {
    if (!open) return;
    void loadFolder(initialPath || "/");
  }, [open, initialPath, loadFolder]);

  const handleConfirm = useCallback(() => {
    if (mode === "folder") {
      onConfirm({ folder: currentPath });
      return;
    }
    if (selectedFiles.length === 0) {
      toast.error("ファイルを選択してください");
      return;
    }
    onConfirm({ files: selectedFiles });
  }, [mode, currentPath, selectedFiles, onConfirm]);

  const toggleSelection = useCallback((id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const breadcrumbs = useMemo(() => {
    const normalized = normalizeNextcloudPath(currentPath);
    const parts = normalized.split("/").filter(Boolean);
    const crumbs: Array<{ label: string; path: string }> = [{ label: "root", path: "/" }];
    parts.reduce((acc, part) => {
      const nextPath = normalizeNextcloudPath(`${acc}/${part}`);
      crumbs.push({ label: part, path: nextPath });
      return nextPath;
    }, "");
    return crumbs;
  }, [currentPath]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">社内ライブラリ</p>
              <p className="text-lg font-semibold text-slate-900">
                {mode === "folder" ? "フォルダを選択" : "ファイルを追加"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
            >
              閉じる
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
            {breadcrumbs.map((crumb, index) => (
              <Fragment key={crumb.path}>
                <button
                  type="button"
                  onClick={() => void loadFolder(crumb.path)}
                  className="rounded px-1 py-0.5 hover:bg-slate-100"
                >
                  {crumb.label}
                </button>
                {index < breadcrumbs.length - 1 ? <span>/</span> : null}
              </Fragment>
            ))}
          </div>
          <div className="mt-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ファイル名で絞り込み"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-1/3 border-r border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500">フォルダ</p>
            <div className="mt-2 space-y-1 overflow-auto pr-1 text-sm">
              {loading && childFolders.length === 0 ? (
                <div className="text-xs text-slate-400">読み込み中…</div>
              ) : null}
              {error ? <div className="text-xs text-rose-600">{error}</div> : null}
              {childFolders.length === 0 && !loading && !error ? (
                <div className="text-xs text-slate-400">サブフォルダはありません</div>
              ) : null}
              {childFolders.map((folder) => (
                <button
                  key={folder.path}
                  type="button"
                  onClick={() => void loadFolder(folder.path)}
                  className="flex w-full items-center justify-between rounded-lg border border-transparent px-2 py-1 text-left text-slate-700 hover:border-slate-200"
                >
                  <div className="min-w-0">
                    <p className="truncate">{folder.label}</p>
                    <p className="text-[11px] text-slate-400">{folder.path}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {folder.scope ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-500">
                        {folder.scope}
                      </span>
                    ) : null}
                    {typeof folder.count === "number" ? (
                      <span className="text-[10px] text-slate-400">{folder.count}件</span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 p-4">
            <p className="text-xs font-semibold text-slate-500">ファイル</p>
            <div className="mt-2 h-full overflow-auto pr-1">
              {mode === "files" ? (
                <ul className="space-y-2">
                  {filteredFiles.length === 0 ? (
                    <li className="text-xs text-slate-400">ファイルがありません</li>
                  ) : null}
                  {filteredFiles.map((file) => (
                    <li key={file.id} className="rounded-lg border border-slate-200 bg-white p-2">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={!!selected[file.id]}
                          onChange={() => toggleSelection(file.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {file.original_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatBytes(file.size_bytes)} ・ {formatDate(file.updated_at)}
                          </div>
                          <div className="text-[11px] text-slate-400">{buildFilePath(file)}</div>
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p>現在のフォルダを Notebook に紐付けます。</p>
                  <p className="mt-2 text-xs text-slate-500">{currentPath}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {mode === "files" ? `選択中: ${selectedFiles.length} 件` : currentPath}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white"
              >
                {mode === "files" ? "選択したファイルを追加" : "このフォルダを紐付け"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function deriveChildFolders(folders: FolderMeta[], currentPath: string) {
  const normalizedCurrent = normalizeNextcloudPath(currentPath);
  const prefix = normalizedCurrent === "/" ? "/" : `${normalizedCurrent}/`;
  const seen = new Set<string>();
  const results: Array<{ path: string; label: string; scope?: string; count?: number }> = [];
  for (const folder of folders) {
    const normalized = normalizeNextcloudPath(folder.path || "/");
    if (normalized === normalizedCurrent) continue;
    if (!normalized.startsWith(prefix)) continue;
    const rest = normalized.slice(prefix.length).replace(/^\/+/, "");
    if (!rest) continue;
    const [segment] = rest.split("/").filter(Boolean);
    if (!segment || seen.has(segment)) continue;
    const path = normalizeNextcloudPath(`${normalizedCurrent}/${segment}`);
    results.push({ path, label: segment, scope: folder.scope, count: folder.count });
    seen.add(segment);
  }
  return results.sort((a, b) => a.label.localeCompare(b.label, "ja"));
}

function formatBytes(bytes?: number) {
  if (!bytes) return "サイズ不明";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function formatDate(value?: string) {
  if (!value) return "更新日時不明";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新日時不明";
  return date.toLocaleDateString();
}

function buildFilePath(file: LibraryFile) {
  const base = normalizeNextcloudPath(file.folder_path || "/");
  if (base === "/") return `/${file.original_name}`;
  return `${base}/${file.original_name}`;
}
