"use client";
import React, { useEffect } from "react";
import { Command } from "cmdk";

type Conv = { id: string; title: string; updatedAt: number };
type Source = { id: string; title?: string; source_uri?: string };

export function CommandK({
  open,
  setOpen,
  conversations,
  sources,
  onPickConversation,
  onPickSource,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  conversations: Conv[];
  sources: Source[];
  onPickConversation: (id: string) => void;
  onPickSource: (id: string) => void;
}) {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-start justify-center pt-24" onClick={()=>setOpen(false)}>
      <Command className="w-[680px] rounded-lg border bg-white shadow-lg" onKeyDown={(e)=>{ if (e.key === "Escape") setOpen(false); }} onClick={(e)=> e.stopPropagation()}>
        <Command.Input autoFocus placeholder="会話 / 参照資料 を検索…" className="w-full px-3 py-2 border-b outline-none" />
        <Command.List className="max-h-[360px] overflow-auto">
          <Command.Empty className="px-3 py-2 text-sm text-slate-500">見つかりません</Command.Empty>
          <Command.Group heading="会話" className="text-xs text-slate-500">
            {conversations.sort((a,b)=> b.updatedAt-a.updatedAt).map(c => (
              <Command.Item key={c.id} onSelect={()=>{ onPickConversation(c.id); setOpen(false); }} className="px-3 py-2 text-sm cursor-pointer aria-selected:bg-blue-50">
                🗂️ {c.title}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Separator />
          <Command.Group heading="参照資料" className="text-xs text-slate-500">
            {sources.map(s => (
              <Command.Item key={s.id} onSelect={()=>{ onPickSource(s.id); setOpen(false); }} className="px-3 py-2 text-sm cursor-pointer aria-selected:bg-blue-50">
                📄 {s.title || s.source_uri || s.id}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

