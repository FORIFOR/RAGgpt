export type NotebookMeta = {
  title: string;
  description?: string;
  nextcloudPath?: string;
  nextcloudUrl?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt: number;
};

const storageKey = (id: string) => `notebook_meta:${id}`;

const fallbackMeta = (id: string): NotebookMeta => ({
  title: id,
  updatedAt: Date.now(),
});

export function loadNotebookMeta(id: string): NotebookMeta {
  if (typeof window === "undefined") {
    return fallbackMeta(id);
  }
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    if (!raw) return fallbackMeta(id);
    const parsed = JSON.parse(raw) as NotebookMeta;
    if (!parsed || typeof parsed.title !== "string") {
      return fallbackMeta(id);
    }
    return {
      title: parsed.title || id,
      description: parsed.description,
      nextcloudPath: parsed.nextcloudPath,
      nextcloudUrl: parsed.nextcloudUrl,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags
            .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
            .filter((tag) => tag.length > 0)
        : undefined,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt || Date.now(),
    };
  } catch {
    return fallbackMeta(id);
  }
}

export function saveNotebookMeta(id: string, meta: NotebookMeta) {
  if (typeof window === "undefined") return;
  const payload: NotebookMeta = {
    title: meta.title?.trim() || id,
    description: meta.description?.trim()
      ? meta.description.trim()
      : undefined,
    nextcloudPath: meta.nextcloudPath?.trim()
      ? meta.nextcloudPath.trim()
      : undefined,
    nextcloudUrl: meta.nextcloudUrl?.trim()
      ? meta.nextcloudUrl.trim()
      : undefined,
    tags: Array.isArray(meta.tags)
      ? meta.tags
          .map((tag) => tag?.trim?.())
          .filter((tag): tag is string => !!tag && tag.length > 0)
      : undefined,
    createdAt: meta.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  window.localStorage.setItem(storageKey(id), JSON.stringify(payload));
}

export function clearNotebookMeta(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(id));
}
