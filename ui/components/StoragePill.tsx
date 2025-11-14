"use client";
import React from "react";

export function StoragePill({ usedBytes, capBytes, totalAllBytes }: { usedBytes?: number|null; capBytes?: number|null; totalAllBytes?: number|null }) {
  const used = Math.max(0, Number(usedBytes||0));
  const cap = capBytes ? Math.max(used, Number(capBytes)) : null;
  const percent = cap ? (used / (cap||1)) * 100 : (totalAllBytes ? (used / Math.max(used, Number(totalAllBytes))) * 100 : 0);
  const fmt = (b: number) => {
    if (b > 1024*1024*1024) return (b/1024/1024/1024).toFixed(1) + " GB";
    if (b > 1024*1024) return (b/1024/1024).toFixed(1) + " MB";
    if (b > 1024) return (b/1024).toFixed(1) + " KB";
    return b + " B";
  };
  const color = cap ? (percent >= 90 ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-emerald-500") : "bg-blue-500";
  return (
    <div className="hidden md:flex items-center gap-2 px-2 py-1 rounded-full border bg-white shadow-sm">
      <div className="text-[11px] text-slate-600">Storage</div>
      <div className="w-24 h-2 bg-slate-200 rounded overflow-hidden">
        <div className={`h-2 ${color}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
      <div className="text-[11px] text-slate-600">
        {cap ? `${fmt(used)} / ${fmt(cap)} (${percent.toFixed(0)}%)` : `${fmt(used)} / all (${percent.toFixed(0)}%)`}
      </div>
    </div>
  );
}

