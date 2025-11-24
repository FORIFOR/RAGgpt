"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function AppHeader() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isNotebookView =
    typeof pathname === "string" &&
    (pathname.startsWith("/notebook/") || pathname.startsWith("/n/"));
  const onLibrary =
    typeof pathname === "string" &&
    (pathname === "/" || pathname.startsWith("/library"));
  const onNotebooks =
    typeof pathname === "string" &&
    (pathname.startsWith("/notebooks") ||
      pathname.startsWith("/n/") ||
      pathname.startsWith("/notebook/") ||
      pathname === "/rag");

  const notebookSlug = useMemo(() => {
    if (!isNotebookView || typeof pathname !== "string") return "";
    const parts = pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || "");
  }, [isNotebookView, pathname]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  // Don't show header on login/signup pages
  if (pathname === "/" || pathname === "/signup") {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link href="/library" className="text-sm font-semibold text-slate-900 hover:opacity-80">
          RAG Notebook
        </Link>
        <nav className="flex items-center gap-2 text-xs text-slate-500">
          <Link
            href="/library"
            className={onLibrary ? "text-slate-700 font-medium" : "hover:text-slate-700"}
          >
            Library
          </Link>
          <Link
            href="/notebooks"
            className={onNotebooks ? "text-slate-700 font-medium" : "hover:text-slate-700"}
          >
            Notebooks
          </Link>
          {isNotebookView ? (
            <>
              <span>/</span>
              <span className="text-slate-700">
                {notebookSlug || "Notebook"}
              </span>
            </>
          ) : null}
        </nav>
        <div className="ml-auto relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            <span>{user?.name || user?.email || "local-user"}</span>
            <span aria-hidden="true">▾</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs font-medium text-slate-900">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  signOut();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
