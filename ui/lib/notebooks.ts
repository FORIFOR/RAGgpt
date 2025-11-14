import { get, update } from 'idb-keyval';

const KEY = 'raggpt:notebooks';

export type NB = { id: string; title: string; created_at: string };

export async function listNotebooks(): Promise<NB[]> {
  try { return (await get(KEY)) ?? []; } catch { return []; }
}

export async function upsertNotebook(nb: NB) {
  await update(KEY, (v: NB[] | undefined) => {
    const arr = Array.isArray(v) ? v.slice() : [];
    const i = arr.findIndex(x => x.id === nb.id);
    if (i >= 0) arr[i] = nb; else arr.unshift(nb);
    return arr;
  });
}

export async function deleteNotebookMeta(id: string) {
  await update(KEY, (v: NB[] | undefined) => {
    const arr = Array.isArray(v) ? v.slice() : [];
    return arr.filter(x => x.id !== id);
  });
}
