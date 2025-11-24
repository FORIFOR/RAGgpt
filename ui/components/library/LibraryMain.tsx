"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { BulkActionBar } from "./BulkActionBar";
import type { Scope } from "./LibraryLayout";
import { UploadDropzone } from "./UploadDropzone";
import { UploadQueue, type UploadItem } from "./UploadQueue";
import {
  FileTable,
  type LibraryFile as PartsFile,
  type LibraryTag as PartsTag,
} from "./LibraryParts";
import { normalizeLibraryEntries, type LibraryFile } from "@/lib/library";
import { TagFilterState } from "@/lib/tags";

type Props = {
  scope: Scope;
  currentFolder: string;
  searchQuery: string;
  tags: TagFilterState;
};

type UploadProgressPatch = Partial<Pick<UploadItem, "progress" | "status" | "error">>;
type FileRow = {
  id: string;
  title: string;
  originalName: string;
  tags: {
    doc_type?: string | null;
    topic?: string | null;
    entity?: string | null;
    state?: string | null;
    extras?: string[];
  } | null;
  scope: Scope;
  folderPath: string;
  sizeLabel: string;
  uploadedAt: string;
  uploadedBy: string;
};

export function LibraryMain({ scope, currentFolder, searchQuery, tags }: Props) {
  const [identity, setIdentity] = useState<{ tenant: string; user: string }>({
    tenant: "demo",
    user: "local",
  });
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: keyof PartsFile; direction: "asc" | "desc" } | null>(null);

  const tableFiles = useMemo<PartsFile[]>(() => {
    const mapped = files.map(mapRowToPartsFile);
    if (!sortConfig) return mapped;
    const { key, direction } = sortConfig;
    return [...mapped].sort((a, b) => {
      const aVal = (a as any)[key] ?? "";
      const bVal = (b as any)[key] ?? "";
      if (typeof aVal === "number" && typeof bVal === "number") {
        return direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      return direction === "asc"
        ? String(aVal).localeCompare(String(bVal), "ja")
        : String(bVal).localeCompare(String(aVal), "ja");
    });
  }, [files, sortConfig]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tenant =
      window.sessionStorage.getItem("tenant")?.trim() ||
      window.localStorage.getItem("tenant")?.trim() ||
      "demo";
    const user =
      window.sessionStorage.getItem("user_id")?.trim() ||
      window.localStorage.getItem("user_id")?.trim() ||
      "local";
    setIdentity({ tenant, user });
  }, []);

  const refreshFiles = useCallback(async () => {
    const params = new URLSearchParams({
      scope,
      folder: currentFolder || "/",
      tenant: identity.tenant,
      user_id: identity.user,
    });
    if (searchQuery.trim()) {
      params.set("q", searchQuery.trim());
    }
    if (tags.doc_type) params.set("doc_type", tags.doc_type);
    if (tags.topic) params.set("topic", tags.topic);
    if (tags.state) params.set("state", tags.state);

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/backend/library/list?${params.toString()}`);
      if (!response.ok) {
        throw new Error("資料リストの取得に失敗しました");
      }
      const payload = (await response.json().catch(() => null)) as { files?: LibraryFile[] } | null;
      const normalized = normalizeLibraryEntries(payload?.files ?? []);
      setFiles(normalized.map(mapLibraryFileToRow));
    } catch (err) {
      const message = err instanceof Error ? err.message : "資料リストの取得に失敗しました";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [scope, currentFolder, searchQuery, tags, identity]);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  useEffect(() => {
    setSelectedIds([]);
  }, [scope, currentFolder]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }, []);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? tableFiles.map((file) => file.id) : []);
    },
    [tableFiles],
  );

  const handleSort = useCallback(
    (key: keyof PartsFile) => {
      setSortConfig((prev) => {
        if (!prev || prev.key !== key) {
          return { key, direction: "asc" };
        }
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      });
    },
    [],
  );

  const patchQueueItem = useCallback((id: string, patch: UploadProgressPatch) => {
    setUploadQueue((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry;
        return { ...entry, ...patch };
      }),
    );
  }, []);

  const removeQueueItem = useCallback((id: string) => {
    setUploadQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleUploadFiles = useCallback(
    async (filesToUpload: File[]) => {
      if (!filesToUpload.length) return;
      const queueItems: UploadItem[] = filesToUpload.map((file) => ({
        id: crypto.randomUUID(),
        file,
        filename: file.name,
        progress: 0,
        status: "uploading",
      }));
      setUploadQueue((prev) => [...prev, ...queueItems]);

      for (const item of queueItems) {
        await uploadSingleFile({
          item,
          scope,
          tenant: identity.tenant,
          userId: identity.user,
          folder: currentFolder || "/",
          onProgress: (patch) => {
            patchQueueItem(item.id, patch);
          },
        });
        await refreshFiles();
      }
    },
    [currentFolder, patchQueueItem, refreshFiles, scope, identity],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<File[]>).detail;
      if (!detail || detail.length === 0) return;
      handleUploadFiles(detail);
    };
    document.addEventListener("library:uploadFiles", handler as EventListener);
    return () => document.removeEventListener("library:uploadFiles", handler as EventListener);
  }, [handleUploadFiles]);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg">
      <div className="space-y-4 border-b border-sumi-200 bg-sumi-50 px-6 py-6">
        <UploadDropzone onFiles={handleUploadFiles} scope={scope} currentFolder={currentFolder} />
        <UploadQueue items={uploadQueue} onRemoveItem={removeQueueItem} />
      </div>

      {selectedIds.length > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.length}
          selectedIds={selectedIds}
          onCompleted={async () => {
            clearSelection();
            await refreshFiles();
          }}
        />
      )}

      <div className="flex-1 overflow-auto px-6 pb-6 pt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-sumi-200 bg-sumi-50 px-4 py-2 text-[13px] text-sumi-700">
          <span>表示 {tableFiles.length} 件</span>
          <span className="text-sumi-500">
            範囲: {scopeLabel(scope)} / {folderLabel(currentFolder)}
            {searchQuery.trim() ? ` / 検索「${searchQuery.trim()}」` : ""}
          </span>
        </div>

        {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>}
        {loading && (
          <div className="mb-3 rounded-md border border-sumi-200 bg-white px-3 py-2 text-[13px] text-sumi-600">
            読み込み中…
          </div>
        )}
        <div className="min-h-[240px] rounded-lg border border-sumi-200 bg-white">
          <FileTable
            files={tableFiles}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            sortConfig={sortConfig}
            onSort={handleSort}
          />
        </div>
      </div>
    </div>
  );
}

type UploadSingleFileArgs = {
  item: UploadItem;
  scope: Scope;
  folder: string;
  tenant: string;
  userId: string;
  onProgress: (patch: UploadProgressPatch) => void;
};

async function uploadSingleFile({ item, scope, folder, tenant, userId, onProgress }: UploadSingleFileArgs) {
  const formData = new FormData();
  formData.append("file", item.file);
  formData.append("scope", scope);
  formData.append("folder", folder);
  formData.append("tenant", tenant);
  formData.append("user_id", userId);

  await new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    const url = new URL("/api/backend/library/upload", window.location.origin);
    url.searchParams.set("tenant", tenant);
    url.searchParams.set("user_id", userId);
    xhr.open("POST", url.toString());
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress({ progress: percent, status: "uploading" });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress({ progress: 100, status: "success" });
      } else {
        const message = describeUploadError(xhr);
        onProgress({ status: "error", error: message });
      }
      resolve();
    };
    xhr.onerror = () => {
      onProgress({ status: "error", error: "ネットワークエラーが発生しました" });
      resolve();
    };
    xhr.send(formData);
  });
}

function describeUploadError(xhr: XMLHttpRequest) {
  if (!xhr.responseText) return "アップロードに失敗しました";
  try {
    const data = JSON.parse(xhr.responseText) as { error?: string };
    return data.error || "アップロードに失敗しました";
  } catch {
    return "アップロードに失敗しました";
  }
}

function scopeLabel(scope: Scope) {
  switch (scope) {
    case "personal":
      return "個人";
    case "team":
      return "チーム";
    case "org":
      return "部署";
    case "company":
      return "会社";
    default:
      return scope;
  }
}

function folderLabel(path: string) {
  if (!path || path === "/") return "ルート";
  return path.replace(/^\/+/, "").split("/").join(" / ");
}

function mapLibraryFileToRow(entry: LibraryFile): FileRow {
  return {
    id: entry.id,
    title: entry.metadata?.title || entry.original_name || "未命名",
    originalName: entry.original_name || entry.metadata?.original_name || "unknown",
    tags: entry.tags || null,
    scope: normalizeScope(entry.scope),
    folderPath: entry.folder_path || "/",
    sizeLabel: formatFileSize(entry.size_bytes),
    uploadedAt: formatTimestamp(entry.updated_at || entry.created_at || ""),
    uploadedBy: entry.owner || "system",
  };
}

function mapRowToPartsFile(row: FileRow): PartsFile {
  return {
    id: row.id,
    name: row.title,
    originalName: row.originalName,
    type: row.tags?.doc_type || "資料",
    size: row.sizeLabel,
    folder: folderLabel(row.folderPath),
    date: row.uploadedAt,
    owner: row.uploadedBy,
    dateFolder: row.uploadedAt.split(" ")[0] || row.uploadedAt,
    tags: buildTags(row),
  };
}

function buildTags(row: FileRow): PartsTag[] {
  const tags: PartsTag[] = [];
  if (row.tags?.doc_type) {
    tags.push({ id: `doc-${row.id}`, label: row.tags.doc_type, category: "docType" });
  }
  if (row.tags?.topic) {
    tags.push({ id: `topic-${row.id}`, label: row.tags.topic, category: "topic" });
  }
  if (row.tags?.entity) {
    tags.push({ id: `entity-${row.id}`, label: row.tags.entity, category: "entity" });
  }
  if (row.tags?.state) {
    tags.push({ id: `state-${row.id}`, label: row.tags.state, category: "state" });
  }
  row.tags?.extras?.forEach((extra, idx) => {
    tags.push({ id: `extra-${row.id}-${idx}`, label: extra, category: "extra" });
  });
  return tags;
}

function normalizeScope(value?: string): Scope {
  const scope = (value || "personal").toLowerCase() as Scope;
  if (scope === "team" || scope === "org" || scope === "company" || scope === "personal") {
    return scope;
  }
  return "personal";
}

function formatFileSize(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatTimestamp(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}
