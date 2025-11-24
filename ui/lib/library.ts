export type LibraryFile = {
  id: string;
  folder_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
  scope?: string;
  doc_type?: string | null;
  status?: string | null;
  owner?: string | null;
  favorite?: boolean;
  tags?: {
    doc_type?: string | null;
    topic?: string | null;
    entity?: string | null;
    state?: string | null;
    extras?: string[];
  } | null;
  metadata?: Record<string, any>;
};

export type FolderMeta = {
  path: string;
  scope: string;
  count?: number;
};

export function normalizeLibraryEntry(entry: any): LibraryFile {
  const fallbackId = entry.id || entry.document_id || entry.file_id || cryptoRandomId();
  const metadata = typeof entry.metadata === "object" && entry.metadata ? entry.metadata : undefined;
  const originalName = entry.original_name || entry.name || "untitled";
  const mimeType = entry.mime_type || entry.contentType || metadata?.mime_type || "application/octet-stream";
  return {
    ...entry,
    id: fallbackId,
    folder_path: entry.folder_path || "/",
    original_name: originalName,
    mime_type: mimeType,
    size_bytes: Number(entry.size_bytes ?? entry.size ?? 0),
    created_at: entry.created_at || entry.lastModified || new Date().toISOString(),
    updated_at: entry.updated_at || entry.lastModified || entry.created_at || new Date().toISOString(),
    scope: (entry.scope || "personal").toLowerCase(),
    doc_type: entry.doc_type || metadata?.doc_type || detectDocType(mimeType, originalName),
    status: entry.status || metadata?.status || null,
    owner: entry.owner || metadata?.owner || entry.user_id || null,
    favorite: Boolean(entry.favorite ?? metadata?.favorite ?? false),
    tags: entry.tags || metadata?.tags || null,
    metadata,
  };
}

export function normalizeLibraryEntries(entries: any[] | null | undefined): LibraryFile[] {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => normalizeLibraryEntry(entry));
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `tmp-${Math.random().toString(16).slice(2)}`;
}

function detectDocType(mime: string, name: string) {
  const value = `${mime} ${name}`.toLowerCase();
  if (value.includes("contract") || value.includes("agreement") || value.includes("契約")) return "contract";
  if (value.includes(".ppt") || value.includes("presentation") || value.includes("資料")) return "presentation";
  if (value.includes("sheet") || value.includes(".xls") || value.includes(".csv")) return "sheet";
  if (value.includes(".md") || value.includes(".txt") || value.includes("note")) return "note";
  if (value.includes(".pdf")) return "pdf";
  if (value.includes(".doc")) return "document";
  return "other";
}
