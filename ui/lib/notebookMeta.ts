export type NotebookMeta = {
  title: string;
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
    updatedAt: Date.now(),
  };
  window.localStorage.setItem(storageKey(id), JSON.stringify(payload));
}

export function clearNotebookMeta(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(id));
}
