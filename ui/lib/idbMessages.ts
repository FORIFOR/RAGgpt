// IndexedDB（idb-keyval）で notebook 単位に保存
import { get, set } from 'idb-keyval';

const key = (notebookId: string) => `raggpt:messages:${notebookId}`;

export async function loadMessages(notebookId: string) {
  try { return (await get(key(notebookId))) ?? []; } catch { return []; }
}
export async function saveMessages(notebookId: string, messages: any[]) {
  try { await set(key(notebookId), messages); } catch {}
}

