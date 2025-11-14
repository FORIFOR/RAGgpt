export type NotebookMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  ts: number;
  sources?: Array<{ doc_id: string; page?: number; title?: string }>;
};

const LS_KEYS = {
  notebooks: 'rag:notebooks',
  notebookTitle: (id: string) => `rag:nb:${id}:title`,
  notebookMsgs: (id: string) => `rag:nb:${id}:messages`,
};

export function loadNotebookIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.notebooks) || '[]');
  } catch {
    return [];
  }
}

export function saveNotebookIds(ids: string[]) {
  localStorage.setItem(LS_KEYS.notebooks, JSON.stringify(ids));
}

export function loadNotebookMessages(id: string): NotebookMessage[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.notebookMsgs(id)) || '[]');
  } catch {
    return [];
  }
}

export function saveNotebookMessages(id: string, msgs: NotebookMessage[]) {
  localStorage.setItem(LS_KEYS.notebookMsgs(id), JSON.stringify(msgs));
}

export function loadNotebookTitle(id: string): string {
  return localStorage.getItem(LS_KEYS.notebookTitle(id)) || '新規ノート';
}

export function saveNotebookTitle(id: string, title: string) {
  localStorage.setItem(LS_KEYS.notebookTitle(id), title);
}

export function removeNotebookId(id: string) {
  const ids = loadNotebookIds().filter(x => x !== id);
  saveNotebookIds(ids);
}

export function removeNotebookTitle(id: string) {
  try { localStorage.removeItem(LS_KEYS.notebookTitle(id)); } catch {}
}

export function removeNotebookMessages(id: string) {
  try { localStorage.removeItem(LS_KEYS.notebookMsgs(id)); } catch {}
}
