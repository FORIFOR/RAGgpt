"use client";
import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { ModelSelect } from "../components/ModelSelect";
import { useProfile, setProfile } from "../lib/profile";
import { StoragePill } from "./StoragePill";

export function Header({ model, setModel, temperature, setTemperature, usage, searchQuery, setSearchQuery }: {
  model: string; setModel: (v:string)=>void; temperature: number; setTemperature: (n:number)=>void;
  usage?: { approxBytes: number; totalBytesAll: number; capacityBytes?: number|null; percentOfCapacity?: number|null } | null;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const [profile, updateProfile] = useProfile();

  const handleLogoClick = () => {
    if (!isHomePage) {
      router.push('/');
    }
  };

  return (
    <header className="h-12 border-b bg-white/70 backdrop-blur flex items-center gap-2 px-3">
      <button 
        onClick={handleLogoClick}
        className={`font-semibold text-slate-800 ${!isHomePage ? 'hover:text-blue-600 cursor-pointer' : ''}`}
      >
        RAG Agent
      </button>
      <select className="ml-2 border rounded px-2 py-1 text-sm" aria-label="Workspace">
        <option>Demo</option>
        <option>Team</option>
        <option>Personal</option>
      </select>
      
      {isHomePage && setSearchQuery ? (
        <div className="mx-3 flex-1">
          <input 
            value={searchQuery || ""} 
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border rounded px-3 py-1.5 text-sm" 
            placeholder="検索（会話・タイトル・サマリー） — ⌘K" 
            aria-label="Conversation Search" 
          />
        </div>
      ) : (
        <div className="mx-3 flex-1">
          <input 
            id="global-search" 
            className="w-full border rounded px-3 py-1.5 text-sm" 
            placeholder="検索（会話・ノート・ソース） — ⌘K" 
            aria-label="Global Search" 
          />
        </div>
      )}
      
      {/* Profile selector */}
      <div className="ml-auto flex items-center gap-2">
        <div className="text-xs text-slate-600">プロファイル</div>
        <select
          className="border rounded px-2 py-1 text-sm"
          aria-label="Profile"
          value={profile}
          onChange={(e) => updateProfile(e.target.value as any)}
        >
          <option value="quiet">Quiet（静音）</option>
          <option value="balanced">Balanced（標準）</option>
          <option value="max">Max（高精度）</option>
        </select>
        {/* Load badge (simple visual; backend連携は後段で強化) */}
        <span
          className={
            `text-[11px] rounded px-2 py-0.5 ${profile==='quiet' ? 'bg-emerald-100 text-emerald-700' : profile==='balanced' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`
          }
          title="現在の運転モード（高負荷時は自動でQuietに降格）"
        >
          {profile==='quiet' ? '🟢 静音' : profile==='balanced' ? '🟢 普段使い' : '🟡 高精度'}
        </span>
      </div>

      <ModelSelect value={model} onChange={setModel} />
      <div className="ml-2 text-xs text-slate-500">温度</div>
      <input type="range" min={0} max={1} step={0.1} value={temperature} onChange={(e)=>setTemperature(parseFloat(e.target.value))} className="w-28" />
      <div className="ml-3">
        <StoragePill usedBytes={usage?.approxBytes} capBytes={usage?.capacityBytes ?? null} totalAllBytes={usage?.totalBytesAll} />
      </div>
    </header>
  );
}
