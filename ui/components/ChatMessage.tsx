"use client";
import React from "react";
import { motion } from "framer-motion";

export function ChatMessage({ role, content, streaming, summary, onAddNote, citationsCount, variant }: { role: "user" | "assistant"; content: string; streaming?: boolean; summary?: string; onAddNote?: (text: string) => void; citationsCount?: number; variant?: 'retrieval' | 'llm' }) {
  const mine = role === "user";
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`max-w-3xl ${mine ? "self-end" : "self-start"} my-2`}>
      <div className={`rounded-2xl px-3 py-2 shadow-sm border text-[15px] leading-7 ${mine ? "bg-blue-50 border-blue-100" : "bg-white border-gray-200"}`}>
        {!mine && variant === 'retrieval' && (citationsCount || 0) > 0 && (
          <div className="mb-2 text-[12px] text-slate-600 flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">検索結果プレビュー</span>
            <span>検索ヒット {citationsCount} 件（直接抜粋）</span>
            <span className="text-slate-400">（右パネルに出典を表示）</span>
          </div>
        )}
        {!mine && variant !== 'retrieval' && (citationsCount || 0) > 0 && (
          <div className="mb-2 text-[12px] text-slate-600 flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">RAG要約</span>
            <span>検索ヒット {citationsCount} 件の根拠からLLMで要約</span>
            <span className="text-slate-400">（右パネルに出典を表示）</span>
          </div>
        )}
        {!mine && summary && (
          <div className="mb-2 flex flex-wrap gap-2">
            {summary.split("\n").filter(Boolean).slice(0,3).map((s, i) => (
              <span key={i} className="inline-flex items-center gap-2 text-xs border rounded-full px-2 py-1 bg-slate-50">
                ⭐ {s}
                {onAddNote && (
                  <button
                    className="text-[11px] text-blue-600 hover:underline"
                    onClick={(e)=>{ e.stopPropagation(); onAddNote(s); }}
                  >
                    ＋ノート
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <div className="whitespace-pre-wrap">
          {content}
          {streaming && <span className="animate-pulse">▋</span>}
        </div>
      </div>
    </motion.div>
  );
}
