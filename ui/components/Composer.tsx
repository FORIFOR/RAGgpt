"use client";
import React, { useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

export function Composer({ onSend, value, onChange, children }: { onSend: (v: string) => void; value?: string; onChange?: (v: string) => void; children?: React.ReactNode }) {
  const [local, setLocal] = useState("");
  const v = value !== undefined ? value : local;
  const setV = (s: string) => { if (onChange) onChange(s); else setLocal(s); };
  const [showSettings, setShowSettings] = useState(false);
  return (
    <div className="sticky bottom-0 bg-white/80 backdrop-blur border-t">
      <div className="max-w-4xl mx-auto p-2">
        <div className="rounded-2xl border bg-white shadow-sm p-2 flex gap-2 relative">
          <TextareaAutosize
            value={v}
            onChange={(e) => setV(e.target.value)}
            maxRows={6}
            placeholder="質問を入力…"
            className="
              w-full rounded-xl p-4
              bg-white text-[#111] placeholder-[#9AA]
              ring-1 ring-[#E5E7EB] focus:ring-2 focus:ring-[#2E7CF6] focus:outline-none
              dark:bg-[#0B0B0B] dark:text-[#EEE] dark:placeholder-[#777] dark:ring-[#2A2A2A] dark:focus:ring-[#5B8BFA]
              caret-[#2E7CF6] focus-visible-ring
              flex-1 resize-none
            "
            onKeyDown={(e)=>{ if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){ if(v.trim()) { onSend(v); setV(""); } } }}
          />
          <button onClick={()=>setShowSettings((s)=>!s)} className="px-2 py-1 rounded-lg border">⚙️</button>
          <button
            onClick={()=>{ if(v.trim()){ onSend(v); setV(""); } }}
            className="h-[48px] px-4 rounded-xl align-middle bg-blue-600 text-white"
            aria-label="送信"
          >
            送信
          </button>
          {showSettings && (
            <div className="absolute right-2 bottom-12 z-10 bg-white border rounded shadow p-3 text-sm w-72">
              {children}
            </div>
          )}
        </div>
        <div className="text-[12px] text-gray-500 text-right pt-1">⌘/Ctrl + Enter で送信</div>
      </div>
    </div>
  );
}
