"use client";

import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { nanoid } from "nanoid";

import { DEFAULT_TENANT, DEFAULT_USER, scopeOf, setScope } from "@/lib/scope";
import {
  clearNotebookMeta,
  loadNotebookMeta,
  saveNotebookMeta,
} from "@/lib/notebookMeta";
import { cn } from "@/lib/utils";
import { ProtectedRoute } from "@/components/ProtectedRoute";

type NotebookSummary = {
  notebook_id: string;
  title?: string | null;
  sources: number;
  updated_at?: number | null;
};

type NotebookResponse = {
  ok: boolean;
  items: NotebookSummary[];
};

function shallowEqualRecord(
  a: Record<string, string>,
  b: Record<string, string>,
) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

const EMOJI_POOL = ["🧠", "📓", "📚", "🗒️", "🔍", "✨", "🧾", "🪄"];

type ConnectionStatus = "checking" | "ok" | "degraded" | "down";

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let detail = "";
    if (contentType.includes("application/json")) {
      const payload = await res.json().catch(() => null);
      if (payload && typeof payload === "object") {
        detail =
          (payload as Record<string, any>).error ??
          (payload as Record<string, any>).message ??
          "";
      }
    } else {
      detail = await res.text().catch(() => "");
    }
    const error = new Error(
      detail
        ? `HTTP ${res.status}: ${detail}`
        : `HTTP ${res.status}: backend unavailable`,
    );
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return (await res.json()) as NotebookResponse;
};

function emojiForNotebook(key: string, fallback?: string | null) {
  const source = (fallback || key || "notebook").trim();
  if (!source) return "🧠";
  let hash = 0;
  for (const char of Array.from(source)) {
    const code = char.codePointAt(0);
    if (typeof code === "number") {
      hash = (hash + code) % 997;
    }
  }
  return EMOJI_POOL[hash % EMOJI_POOL.length];
}

function formatUpdated(timestamp?: number | null) {
  if (!timestamp) return "更新履歴なし";
  const ms = timestamp * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "更新履歴なし";
  const date = new Date(ms);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "1分以内";
  if (diff < 3_600_000) {
    const minutes = Math.floor(diff / 60_000);
    return `${minutes}分前`;
  }
  if (diff < 86_400_000) {
    const hours = Math.floor(diff / 3_600_000);
    return `${hours}時間前`;
  }
  if (diff < 604_800_000) {
    const days = Math.floor(diff / 86_400_000);
    return `${days}日前`;
  }
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

type NotebookCardProps = {
  summary: NotebookSummary;
  isActive: boolean;
  onOpen: (id: string) => void;
  onCopy: (id: string) => void;
  onRefresh: () => void;
  onDelete: (id: string) => Promise<void> | void;
  isDeleting: boolean;
  displayTitle: string;
};

function NotebookCard({
  summary,
  isActive,
  onOpen,
  onCopy,
  onRefresh,
  onDelete,
  isDeleting,
  displayTitle,
}: NotebookCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const safeId = useMemo(() => encodeURIComponent(summary.notebook_id), [summary.notebook_id]);

  const toggleMenu = useCallback(
    (next: boolean) => {
      setMenuOpen(next);
    },
    [],
  );

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const menu = document.getElementById(`notebook-menu-${safeId}`);
      const trigger = document.getElementById(`notebook-trigger-${safeId}`);
      if (menu?.contains(target) || trigger?.contains(target)) return;
      setMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen, safeId]);

  const handleOpen = useCallback(() => {
    onOpen(summary.notebook_id);
  }, [onOpen, summary.notebook_id]);

  const handleCopy = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setMenuOpen(false);
      onCopy(summary.notebook_id);
    },
    [onCopy, summary.notebook_id],
  );

  const handleQuickOpen = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setMenuOpen(false);
      handleOpen();
    },
    [handleOpen],
  );

  const handleRefresh = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setMenuOpen(false);
      startTransition(() => {
        onRefresh();
      });
    },
    [onRefresh],
  );

  const handleDelete = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setMenuOpen(false);
      void onDelete(summary.notebook_id);
    },
    [onDelete, summary.notebook_id],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpen();
        }
      }}
      className={cn(
        "card-focus relative flex h-48 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-sky-300",
        isActive && "border-sky-300 shadow-md",
      )}
      data-selected={isActive ? "true" : undefined}
    >
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-2xl">
            {emojiForNotebook(summary.notebook_id, summary.title)}
          </div>
          <button
            id={`notebook-trigger-${safeId}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleMenu(!menuOpen);
            }}
            className="btn-focus rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            ⋯
          </button>
        </div>
        <div className="space-y-2">
          <h2 className="line-clamp-2 text-lg font-semibold text-slate-900">
            {displayTitle}
          </h2>
          <p className="text-sm text-slate-500" title="登録されている資料の件数">
            {summary.sources} 件のソース
          </p>
        </div>
        <div className="mt-auto text-xs text-slate-400" title="最終更新">
          {formatUpdated(summary.updated_at)}
        </div>
      </div>

      {menuOpen ? (
        <div
          id={`notebook-menu-${safeId}`}
          role="menu"
          className="absolute right-4 top-14 z-20 w-48 rounded-xl border border-slate-200 bg-white py-2 text-sm shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleQuickOpen}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 transition hover:bg-slate-100"
            role="menuitem"
          >
            開く
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 transition hover:bg-slate-100"
            role="menuitem"
          >
            ノートIDをコピー
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isPending}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            role="menuitem"
          >
            このノートを再読み込み
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
            role="menuitem"
          >
            ノートブックを削除
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NotebooksPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<{ tenant: string; user: string }>({
    tenant: DEFAULT_TENANT,
    user: DEFAULT_USER,
  });
  const [lastNotebookId, setLastNotebookId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [localTitles, setLocalTitles] = useState<Record<string, string>>({});
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("checking");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tenant =
      window.sessionStorage.getItem("tenant")?.trim() || DEFAULT_TENANT;
    const user =
      window.sessionStorage.getItem("user_id")?.trim() || DEFAULT_USER;
    const last = window.sessionStorage.getItem("notebook_id")?.trim() || null;
    setIdentity({ tenant, user });
    setLastNotebookId(last);
    setReady(true);
  }, []);

  const swrKey = useMemo(() => {
    if (!ready) return null;
    const params = new URLSearchParams({
      tenant: identity.tenant,
      user_id: identity.user,
      include_global: "false",
    });
    return `/api/backend/notebooks?${params.toString()}`;
  }, [identity, ready]);

  const { data, error, isLoading, mutate } = useSWR<NotebookResponse>(
    swrKey,
    fetcher,
    { revalidateOnFocus: false },
  );

  const notebooks = useMemo(
    () => (Array.isArray(data?.items) ? data.items : []),
    [data?.items],
  );

  useEffect(() => {
    if (!ready || !swrKey) {
      setConnectionStatus("checking");
      setStatusMessage(null);
      return;
    }
    if (error) {
      const statusCode = (error as Error & { status?: number }).status;
      setStatusMessage(error.message);
      setConnectionStatus(
        typeof statusCode === "number" && statusCode >= 500 ? "down" : "degraded",
      );
      return;
    }
    if (isLoading) {
      setConnectionStatus((prev) => (prev === "ok" ? "ok" : "checking"));
      return;
    }
    if (data?.ok) {
      setConnectionStatus("ok");
      setStatusMessage(null);
    } else if (data) {
      setConnectionStatus("degraded");
      setStatusMessage("バックエンドを準備中です。しばらくお待ちください。");
    }
  }, [ready, swrKey, error, isLoading, data]);

  useEffect(() => {
    if (connectionStatus !== "down" || !swrKey) return;
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      void mutate();
    }, 3000);
    return () => {
      window.clearInterval(id);
    };
  }, [connectionStatus, mutate, swrKey]);

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    if (!Array.isArray(data?.items) || data.items.length === 0) {
      setLocalTitles((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const map: Record<string, string> = {};
    data.items.forEach((nb) => {
      const meta = loadNotebookMeta(nb.notebook_id);
      if (meta.title && meta.title !== nb.notebook_id) {
        map[nb.notebook_id] = meta.title;
      }
    });
    setLocalTitles((prev) => (shallowEqualRecord(prev, map) ? prev : map));
  }, [data?.items, ready]);

  const openNotebook = useCallback(
    (rawId: string) => {
      const trimmed = (rawId || "").trim();
      if (!trimmed) return;
      const scope = scopeOf(trimmed, {
        tenant: identity.tenant,
        user_id: identity.user,
        include_global: false,
      });
      setScope(scope);
      setLastNotebookId(trimmed);
      router.push(`/n/${encodeURIComponent(trimmed)}`);
    },
    [identity, router],
  );

  const createNotebook = useCallback(() => {
    const generatedId = `n_${nanoid(8)}`;
    saveNotebookMeta(generatedId, {
      title: "Untitled notebook",
      updatedAt: Date.now(),
    });
    openNotebook(generatedId);
  }, [openNotebook]);

  const handleRetry = useCallback(() => {
    setConnectionStatus("checking");
    setStatusMessage(null);
    void mutate();
  }, [mutate]);

  const copyNotebookId = useCallback(async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("ノートIDをコピーしました");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "クリップボードにアクセスできませんでした";
      toast.error(message);
    }
  }, []);

  const handleDeleteNotebook = useCallback(
    async (rawId: string) => {
      const trimmed = rawId.trim();
      if (!trimmed) return;
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          `ノートブック「${trimmed}」を削除しますか？この操作は取り消せません。`,
        );
        if (!confirmed) return;
      }
      setDeletingId(trimmed);
      try {
        const params = new URLSearchParams({
          tenant: identity.tenant,
          user_id: identity.user,
          notebook_id: trimmed,
          include_global: "false",
        });
        const res = await fetch(
          `/api/backend/notebooks/${encodeURIComponent(trimmed)}?${params.toString()}`,
          {
            method: "DELETE",
            headers: {
              "Accept": "application/json",
            },
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }
        toast.success("ノートブックを削除しました");
        setLastNotebookId((prev) => (prev === trimmed ? null : prev));
        clearNotebookMeta(trimmed);
        setLocalTitles((prev) => {
          if (!prev[trimmed]) return prev;
          const next = { ...prev };
          delete next[trimmed];
          return next;
        });
        if (typeof window !== "undefined") {
          const scopeRaw = window.sessionStorage.getItem("scope");
          if (scopeRaw) {
            try {
              const scope = JSON.parse(scopeRaw) as { notebook_id?: string };
              if (scope?.notebook_id === trimmed) {
                window.sessionStorage.removeItem("scope");
                window.sessionStorage.removeItem("notebook_id");
                window.sessionStorage.removeItem("include_global");
              }
            } catch {
              // ignore parsing errors
            }
          }
        }
        await mutate();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "ノートブックの削除に失敗しました";
        toast.error(message);
      } finally {
        setDeletingId(null);
      }
    },
    [identity, mutate],
  );

  const showStatusBanner = connectionStatus !== "ok";
  const bannerClass =
    connectionStatus === "down"
      ? "border-red-200 bg-red-50 text-red-700"
      : connectionStatus === "degraded"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
  const statusLabel =
    connectionStatus === "down"
      ? "バックエンドを再接続中です。数秒後に自動で再試行します。"
      : connectionStatus === "degraded"
        ? "バックエンドの応答が遅延しています。しばらく待ってから再試行してください。"
        : "バックエンドの状態を確認しています…";
  const showRetryButton =
    connectionStatus === "down" || connectionStatus === "degraded";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      {showStatusBanner ? (
        <div className={cn("rounded-md border px-4 py-3 text-sm", bannerClass)}>
          <p className="font-medium">{statusLabel}</p>
          {statusMessage ? (
            <p className="mt-1 text-xs opacity-80 break-all">{statusMessage}</p>
          ) : null}
          {showRetryButton ? (
            <button
              onClick={handleRetry}
              className="mt-2 inline-flex items-center rounded border border-current px-3 py-1 text-xs font-medium"
            >
              再試行
            </button>
          ) : null}
        </div>
      ) : null}
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          最近のノートブック
        </h1>
        <p className="text-sm text-slate-500">
          チームの資料をノート単位で整理し、NotebookLM のようにすばやく再開できます。
        </p>
      </header>

      <section>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            onClick={createNotebook}
            className="card-focus group flex h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-600"
          >
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-2xl transition group-hover:bg-indigo-50">
              ＋
            </span>
            <span className="text-sm font-medium">
              ノートブックを新規作成
            </span>
          </button>

          {isLoading || !ready
            ? Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`skeleton-${index}`}
                className="aspect-[4/3] animate-pulse rounded-3xl border border-slate-200 bg-slate-100"
              />
            ))
            : notebooks.map((summary) => (
              <NotebookCard
                key={summary.notebook_id}
                summary={summary}
                isActive={lastNotebookId === summary.notebook_id}
                onOpen={openNotebook}
                onCopy={copyNotebookId}
                onRefresh={() => {
                  void mutate();
                }}
                onDelete={handleDeleteNotebook}
                isDeleting={deletingId === summary.notebook_id}
                displayTitle={
                  localTitles[summary.notebook_id]?.trim() ||
                  summary.title?.trim() ||
                  summary.notebook_id
                }
              />
            ))}
        </div>

        {!isLoading && ready && notebooks.length === 0 && !error ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            まだノートブックがありません。右上のカードからノートを作成し、資料をアップロードしてください。
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
            ノート一覧を読み込めませんでした。ネットワーク設定を確認し、再読み込みしてください。
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default function ProtectedNotebooksPage() {
  return (
    <ProtectedRoute>
      <NotebooksPage />
    </ProtectedRoute>
  );
}
