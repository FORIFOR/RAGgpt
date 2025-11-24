"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActiveFilters,
  AiBulkDialog,
  BulkActionBar,
  DeleteConfirmationDialog,
  Dropzone,
  FileTable,
  HeaderBar,
  Sidebar,
  mockFiles,
  buildDateTree,
  applyDateFilter,
  applyTagFilters,
  applyViewFilter,
  type DateFilter,
  type DateTreeYear,
  type LibraryFile,
  type LibraryTag,
  type SmartView,
} from "./LibraryParts";
import type { LibraryScope } from "./library-types";
import { normalizeLibraryEntries, type LibraryFile as ApiFile } from "@/lib/library";

export function LibraryApp() {
  const [scope, setScope] = useState<LibraryScope>("personal");
  const [files, setFiles] = useState<LibraryFile[]>(mockFiles);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<LibraryTag[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [viewFilter, setViewFilter] = useState<SmartView>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>({});
  const [sortConfig, setSortConfig] = useState<{
    key: keyof LibraryFile;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<{ tenant: string; user: string }>({ tenant: "demo", user: "local" });
  const [uploading, setUploading] = useState(false);

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
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        scope,
        folder: "/",
        tenant: identity.tenant,
        user_id: identity.user,
      });
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }
      const response = await fetch(`/api/backend/library/list?${params.toString()}`);
      if (!response.ok) {
        throw new Error("資料リストの取得に失敗しました");
      }
      const payload = (await response.json().catch(() => null)) as { files?: ApiFile[] } | null;
      const normalized = normalizeLibraryEntries(payload?.files ?? []);
      setFiles(normalized.map(mapApiToPartsFile));
    } catch (err) {
      const message = err instanceof Error ? err.message : "資料リストの取得に失敗しました";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [identity, scope, searchQuery]);

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles]);

  const handleUploadFiles = useCallback(
    async (fileList: File[]) => {
      if (!fileList.length) return;
      setUploading(true);
      setError(null);
      for (const file of fileList) {
        await uploadSingleFile({
          file,
          scope,
          tenant: identity.tenant,
          userId: identity.user,
        });
      }
      await refreshFiles();
      setUploading(false);
    },
    [identity, scope, refreshFiles],
  );

  const dateTree = useMemo<DateTreeYear[]>(() => buildDateTree(files), [files]);
  const dateFiltered = useMemo(() => applyDateFilter(files, dateFilter), [files, dateFilter]);
  const viewFiltered = useMemo(() => applyViewFilter(dateFiltered, viewFilter), [dateFiltered, viewFilter]);
  const tagFiltered = useMemo(() => applyTagFilters(viewFiltered, activeFilters), [viewFiltered, activeFilters]);

  const sortedFiles = useMemo(() => {
    if (!sortConfig) return tagFiltered;

    return [...tagFiltered].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      // Handle different types
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comparison = aVal.localeCompare(bVal, 'ja');
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // For arrays (tags), sort by length
      if (Array.isArray(aVal) && Array.isArray(bVal)) {
        return sortConfig.direction === 'asc' ? aVal.length - bVal.length : bVal.length - aVal.length;
      }

      return 0;
    });
  }, [tagFiltered, sortConfig]);

  const selectedFiles = useMemo(
    () => files.filter((file) => selectedIds.includes(file.id)),
    [files, selectedIds],
  );

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? sortedFiles.map((file) => file.id) : []);
  };

  const handleTagFilterAdd = (tag: LibraryTag) => {
    setActiveFilters((prev) => {
      if (prev.some((item) => item.id === tag.id)) return prev;
      return [...prev, tag];
    });
  };

  const handleTagFilterRemove = (tag: LibraryTag) => {
    setActiveFilters((prev) => prev.filter((item) => item.id !== tag.id));
  };

  const handleSort = (key: keyof LibraryFile) => {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) {
        return { key, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return null; // Clear sort
    });
  };

  const handleBulkAction = (action: "delete" | "move" | "permission" | "notebook" | "ai") => {
    if (action === "ai") {
      setBulkDialogOpen(true);
    } else if (action === "delete") {
      setDeleteDialogOpen(true);
    } else {
      console.log(`Bulk ${action} for:`, selectedIds);
    }
  };

  const confirmDelete = () => {
    console.log(`Deleting ${selectedIds.length} files:`, selectedIds);
    // TODO: Actual delete logic here
    setSelectedIds([]);
    setDeleteDialogOpen(false);
  };

  return (
    <div className="min-h-screen bg-sumi-50">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-6 pb-12">
        <HeaderBar
          scope={scope}
          onScopeChange={setScope}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onUploadFiles={handleUploadFiles}
        />
        <ActiveFilters
          filters={activeFilters}
          viewFilter={viewFilter}
          dateFilter={dateFilter}
          onRemoveTag={handleTagFilterRemove}
          onClearTags={() => setActiveFilters([])}
          onClearView={() => setViewFilter("all")}
          onClearDate={() => setDateFilter({})}
        />
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5">
          <aside className="hidden lg:block">
            <div className="bg-white border border-sumi-200 rounded-lg shadow-sm min-h-[540px] sticky top-6">
              <Sidebar
                viewFilter={viewFilter}
                onViewChange={setViewFilter}
                dateTree={dateTree}
                activeDate={dateFilter}
                onSelectDate={setDateFilter}
              />
            </div>
          </aside>

          <section className="bg-white border border-sumi-200 rounded-lg shadow-sm min-h-[540px] flex flex-col overflow-hidden">
            <div className="p-6 border-b bg-sea-50/40">
              <Dropzone
                scope={scope}
                onUploadFiles={handleUploadFiles}
              />
            </div>
            <BulkActionBar
              count={selectedIds.length}
              onClear={() => setSelectedIds([])}
              onAction={handleBulkAction}
            />
            <div className="flex-1 overflow-auto">
              {error && (
                <div className="mx-4 my-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                  {error}
                </div>
              )}
              {uploading && (
                <div className="mx-4 my-2 rounded-md border border-sea-200 bg-sea-50 px-3 py-2 text-[13px] text-sea-700">
                  アップロード中です…
                </div>
              )}
              {loading && (
                <div className="mx-4 my-2 rounded-md border border-sumi-200 bg-white px-3 py-2 text-[13px] text-sumi-600">
                  読み込み中…
                </div>
              )}
              <FileTable
                files={sortedFiles}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onToggleSelectAll={handleToggleSelectAll}
                onTagFilterAdd={handleTagFilterAdd}
                sortConfig={sortConfig}
                onSort={handleSort}
              />
            </div>
          </section>
        </div>
        <AiBulkDialog
          open={bulkDialogOpen}
          files={selectedFiles}
          onApply={() => setSelectedIds([])}
          onClose={() => setBulkDialogOpen(false)}
        />
        <DeleteConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={confirmDelete}
          itemCount={selectedIds.length}
        />
      </div>
    </div>
  );
}

function mapApiToPartsFile(entry: ApiFile): LibraryFile {
  const name = entry.metadata?.title || entry.original_name || "未命名";
  const tags: LibraryTag[] = [];
  const tagSet = entry.tags || entry.metadata?.tags;
  if (tagSet?.doc_type) tags.push({ id: `doc-${entry.id}`, label: tagSet.doc_type, category: "docType" });
  if (tagSet?.topic) tags.push({ id: `topic-${entry.id}`, label: tagSet.topic, category: "topic" });
  if (tagSet?.entity) tags.push({ id: `entity-${entry.id}`, label: tagSet.entity, category: "entity" });
  if (tagSet?.state) tags.push({ id: `state-${entry.id}`, label: tagSet.state, category: "state" });
  tagSet?.extras?.forEach((extra: string, idx: number) =>
    tags.push({ id: `extra-${entry.id}-${idx}`, label: extra, category: "extra" }),
  );

  return {
    id: entry.id,
    name,
    originalName: entry.original_name || entry.metadata?.original_name || "unknown",
    type: entry.doc_type || entry.mime_type || "Document",
    size: formatFileSize(entry.size_bytes),
    folder: entry.folder_path || "/",
    date: formatTimestamp(entry.updated_at || entry.created_at || ""),
    owner: entry.owner || (entry as any).user_id || "system",
    dateFolder: buildDateFolder(entry.updated_at || entry.created_at),
    tags,
    summary: entry.metadata?.summary,
  };
}

async function uploadSingleFile({
  file,
  scope,
  tenant,
  userId,
}: {
  file: File;
  scope: string;
  tenant: string;
  userId: string;
}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("scope", scope);
  formData.append("folder", "/");
  formData.append("tenant", tenant);
  formData.append("user_id", userId);

  await new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    const url = new URL("/api/backend/library/upload", window.location.origin);
    url.searchParams.set("tenant", tenant);
    url.searchParams.set("user_id", userId);
    xhr.open("POST", url.toString());
    xhr.onload = () => resolve();
    xhr.onerror = () => resolve();
    xhr.send(formData);
  });
}

function formatFileSize(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatTimestamp(value?: string) {
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

function buildDateFolder(value?: string) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}/${m}/${d}`;
}
