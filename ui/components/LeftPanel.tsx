"use client";
import React, { useMemo, useState } from "react";

type Conversation = { id: string; title: string; updatedAt: number; pinned?: boolean; summary?: string };
type SourceDoc = { id: string; title?: string; type?: string; updatedAt?: number; enabled?: boolean; usageCount?: number; lastUsedAt?: number };

export function LeftPanel({
  sources,
  highlightSources,
}: {
  sources: SourceDoc[];
  highlightSources?: Record<string, { count: number; lastAt: number }>;
}) {
  const [q, setQ] = useState("");
  const srcs = useMemo(() => {
    const list = [...sources];
    list.sort((a,b)=> (highlightSources?.[a.title||a.id||""]?1:0) > (highlightSources?.[b.title||b.id||""]?1:0) ? -1 : 1);
    if (!q.trim()) return list;
    const qq = q.toLowerCase();
    return list.filter(s => (s.title||s.id).toLowerCase().includes(qq));
  }, [sources, q, highlightSources]);

  return (
    <aside
      className="border-r bg-white overflow-hidden h-full flex flex-col"
      aria-label="参照資料リスト"
    >
      <div className="h-10 border-b flex items-center">
        <div className="px-3 h-full flex items-center text-slate-900 font-medium">参照資料</div>
      </div>
      <div className="p-2">
        <input aria-label="Filter" value={q} onChange={e=>setQ(e.target.value)} placeholder="資料を検索…" className="w-full border rounded px-2 py-1 text-sm" />
      </div>
      <div className="flex-1 overflow-auto p-2">
        <ul className="space-y-2">
          {srcs.length===0 && <li className="text-xs text-slate-500">資料がありません</li>}
          {srcs.map(s => {
            const key = s.title || s.id;
            const h = highlightSources?.[key||''];
            return (
              <li key={s.id} className={`border rounded p-2 ${h? 'bg-blue-50 border-blue-200': 'bg-white'} flex items-center justify-between`}>
                <div className="min-w-0">
                  <div className="text-sm truncate flex items-center gap-2">
                    <span>{s.title || s.id}</span>
                    {h && <span className="text-[10px] text-green-700 bg-green-100 rounded px-1">参照 {h.count}</span>}
                  </div>
                  <div className="text-[11px] text-slate-500">{s.type || 'doc'} ・ {s.updatedAt? new Date(s.updatedAt).toLocaleString(): '—'}</div>
                </div>
                <div className="text-[11px] text-slate-500">{h?.lastAt? new Date(h.lastAt).toLocaleDateString(): ''}</div>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

