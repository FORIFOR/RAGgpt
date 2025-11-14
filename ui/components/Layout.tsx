"use client";
import React, { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { AccessibilityProvider, AccessibilityPanel, SkipLink } from "./AccessibilityProvider";

interface LayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

export function Layout({ children, showSidebar = true }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<string>(() => {
    try { return localStorage.getItem('rag.profile') || 'balanced'; } catch { return 'balanced'; }
  });
  useEffect(() => {
    const onChange = (e: any) => setProfile((e?.detail as string) || (localStorage.getItem('rag.profile') || 'balanced'));
    window.addEventListener('profile:change', onChange as any);
    return () => window.removeEventListener('profile:change', onChange as any);
  }, []);

  useEffect(() => {
    // In dev, ensure any Service Worker is unregistered to avoid stale assets
    if (process.env.NODE_ENV === 'development' && 'serviceWorker' in navigator) {
      try {
        navigator.serviceWorker.getRegistrations?.().then(rs => rs.forEach(r => r.unregister()));
      } catch {}
    }
  }, []);

  if (!showSidebar) {
    return (
      <AccessibilityProvider>
        {children}
      </AccessibilityProvider>
    );
  }

  return (
    <AccessibilityProvider>
      <div className="h-screen flex bg-slate-50">
        {/* Skip links for keyboard navigation */}
        <SkipLink href="#main-content">メインコンテンツにスキップ</SkipLink>
        <SkipLink href="#sidebar-nav">サイドバーナビゲーションにスキップ</SkipLink>
        
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Desktop header (profile + load badge) */}
          <div className="hidden lg:flex h-10 items-center justify-end gap-2 px-3 border-b bg-white">
            <div className="text-xs text-slate-600">プロファイル</div>
            <select
              className="border rounded px-2 py-1 text-sm"
              aria-label="Profile"
              value={profile}
              onChange={(e)=>{ try { localStorage.setItem('rag.profile', e.target.value); } catch{}; window.dispatchEvent(new CustomEvent('profile:change', { detail: e.target.value })); }}
            >
              <option value="quiet">Quiet（静音）</option>
              <option value="balanced">Balanced（標準）</option>
              <option value="max">Max（高精度）</option>
            </select>
            <span className={`text-[11px] rounded px-2 py-0.5 ${profile==='quiet'?'bg-emerald-100 text-emerald-700':profile==='balanced'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-700'}`}>
              {profile==='quiet'?'🟢 静音':profile==='balanced'?'🟢 普段使い':'🟡 高精度'}
            </span>
          </div>
          {/* Mobile header */}
          <header className="lg:hidden bg-white border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="サイドバーメニューを開く"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" role="img" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-md flex items-center justify-center" role="img" aria-label="RAG Notebook ロゴ">
                  <span className="text-white font-bold text-xs">R</span>
                </div>
                <h1 className="text-lg font-semibold text-slate-800">RAG Notebook</h1>
              </div>

              <button 
                className="w-10 h-10 bg-slate-300 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="ユーザーメニューを開く"
              >
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" role="img" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </button>
            </div>
          </header>

          {/* Main content area */}
          <main id="main-content" className="flex-1 overflow-auto" role="main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </AccessibilityProvider>
  );
}
