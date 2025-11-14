"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppHeader() {
  const pathname = usePathname();

  const isNotebookView =
    typeof pathname === "string" &&
    (pathname.startsWith("/notebook/") || pathname.startsWith("/n/"));
  const onNotebooks =
    typeof pathname === "string" && pathname.startsWith("/notebooks");

  const notebookSlug = useMemo(() => {
    if (!isNotebookView || typeof pathname !== "string") return "";
    const parts = pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || "");
  }, [isNotebookView, pathname]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link
          href="/notebooks"
          className="text-sm font-semibold text-slate-900 hover:opacity-80"
        >
          RAG Notebook
        </Link>
        <nav className="flex items-center gap-2 text-xs text-slate-500">
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
        <div className="ml-auto">
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            <span>local-user</span>
            <span aria-hidden="true">▾</span>
          </button>
        </div>
      </div>
    </header>
  );
}
