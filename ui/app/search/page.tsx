"use client";

import clsx from "clsx";
import type { FormEvent } from "react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Layout } from "@/components/Layout";
import { DEFAULT_TENANT, DEFAULT_USER } from "@/lib/scope";
import type { SearchHit, SearchResponse } from "@/lib/api/contracts";

type ScopeFilter = "personal" | "team" | "org" | "company";
type DateFilter = "any" | "7d" | "30d" | "90d";
type StatusFilter = "all" | "draft" | "review" | "final";
type DocTypeFilter = "all" | "pdf" | "document" | "sheet" | "presentation" | "contract" | "note" | "other";

type DocumentSummary = {
  doc_id: string;
  title?: string;
  user_id?: string;
  notebook_id?: string;
  is_global?: boolean;
  source_file_path?: string;
  metadata?: Record<string, any> | null;
  last_updated?: number | null;
};

type EnrichedResult = {
  id: string;
  docId: string;
  title: string;
  snippet: string;
  page?: number;
  score: number;
  docType: DocTypeFilter;
  scope: ScopeFilter;
  owner: string;
  updatedAt: Date | null;
  statusKey: StatusFilter | "other";
  statusLabel: string;
  path?: string;
};

type AiLogEntry = { role: "user" | "assistant"; text: string };

type AiSuggestion = { key: string; label: string; description: string };

const HISTORY_KEY = "search.history.v2";

const SCOPE_OPTIONS: Array<{ value: ScopeFilter; label: string; helper: string }> = [
  { value: "personal", label: "自分だけ", helper: "あなた専用の資料" },
  { value: "team", label: "所属チーム", helper: "チーム共有" },
  { value: "org", label: "部署", helper: "部署/部門単位" },
  { value: "company", label: "会社全体", helper: "全社公開" },
];

const DOC_TYPE_OPTIONS: Array<{ value: DocTypeFilter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "pdf", label: "PDF" },
  { value: "document", label: "ドキュメント" },
  { value: "sheet", label: "スプレッドシート" },
  { value: "presentation", label: "プレゼン" },
  { value: "contract", label: "契約書" },
  { value: "note", label: "ノート" },
  { value: "other", label: "その他" },
];

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "final", label: "Final" },
];

const DATE_RANGE_OPTIONS: Array<{ value: DateFilter; label: string }> = [
  { value: "any", label: "指定なし" },
  { value: "7d", label: "直近7日" },
  { value: "30d", label: "直近30日" },
  { value: "90d", label: "直近90日" },
];

const AI_SUGGESTIONS: AiSuggestion[] = [
  { key: "summarize", label: "代表3件を要約", description: "AIが主要ポイントを整理" },
  { key: "company", label: "会社全体に広げる", description: "スコープを全社に拡張" },
  { key: "draft", label: "Draftだけ見たい", description: "状態フィルタをDraftへ" },
  { key: "recent", label: "最近1週間だけ", description: "更新日の絞り込み" },
  { key: "keyword-a", label: "A社関連を抽出", description: "クエリにキーワード追加" },
];

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <Layout>
          <div className="flex h-96 items-center justify-center">
            <div className="text-center text-slate-500">読み込み中…</div>
          </div>
        </Layout>
      }
    >
      <SearchExperience />
    </Suspense>
  );
}

function SearchExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(() => searchParams?.get("q")?.trim() || "");
  const [history, setHistory] = useState<string[]>([]);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("personal");
  const [docTypeFilter, setDocTypeFilter] = useState<DocTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [identity, setIdentity] = useState({ tenant: DEFAULT_TENANT, user: DEFAULT_USER });
  const [documentsIndex, setDocumentsIndex] = useState<Record<string, DocumentSummary>>({});
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLog, setAiLog] = useState<AiLogEntry[]>([]);
  const [aiPrompt, setAiPrompt] = useState("");

  const includeGlobal = scopeFilter === "org" || scopeFilter === "company";
  const notebookId = `library-${scopeFilter}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(stored)) {
        setHistory(stored.filter((item): item is string => typeof item === "string"));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tenant = window.sessionStorage.getItem("tenant")?.trim() || DEFAULT_TENANT;
    const user = window.sessionStorage.getItem("user_id")?.trim() || DEFAULT_USER;
    setIdentity({ tenant, user });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadDocuments() {
      setDocumentsLoading(true);
      setDocumentsError(null);
      try {
        const params = new URLSearchParams({
          tenant: identity.tenant,
          user_id: identity.user,
          notebook_id: notebookId,
          include_global: includeGlobal ? "true" : "false",
        });
        const response = await fetch(`/api/backend/documents?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.detail || payload?.error || response.statusText);
        }
        const docs = Array.isArray(payload?.documents) ? payload.documents : [];
        const next: Record<string, DocumentSummary> = {};
        for (const doc of docs) {
          const normalized = normalizeDocumentSummary(doc);
          if (normalized.doc_id) {
            next[normalized.doc_id] = normalized;
          }
        }
        setDocumentsIndex(next);
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        const message = err instanceof Error ? err.message : String(err);
        setDocumentsError(message);
      } finally {
        setDocumentsLoading(false);
      }
    }
    void loadDocuments();
    return () => controller.abort();
  }, [identity, notebookId, includeGlobal]);

  const performSearch = useCallback(
    async (forcedQuery?: string) => {
      const q = (forcedQuery ?? query).trim();
      if (!q) {
        setHits([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      setAiSummary(null);
      const started = performance.now();
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: q,
            limit: 40,
            with_context: true,
            context_size: 1,
            retriever: "mcp",
            rerank: true,
            tenant: identity.tenant,
            user_id: identity.user,
            notebook: notebookId,
            notebook_id: notebookId,
            include_global: includeGlobal,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as SearchResponse & { error?: string };
        if (payload?.error) {
          throw new Error(payload.error);
        }
        const content = payload?.result?.content ?? [];
        const nextHits = content.filter((item): item is SearchHit => item?.type === "hit");
        setHits(nextHits);
        setLatency(payload?.latency_ms ?? performance.now() - started);
        setHistory((prev) => {
          const next = [q, ...prev.filter((item) => item !== q)].slice(0, 8);
          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
            } catch {
              // ignore
            }
          }
          return next;
        });
        router.replace(`/search?q=${encodeURIComponent(q)}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [query, identity, notebookId, includeGlobal, router],
  );

  useEffect(() => {
    const initial = searchParams?.get("q")?.trim();
    if (initial) {
      setQuery(initial);
      void performSearch(initial);
    }
  }, [searchParams, performSearch]);

  const enrichedResults = useMemo(() => hits.map((hit) => enrichHit(hit, documentsIndex)), [hits, documentsIndex]);
  const ownerFilterValue = ownerFilter.trim().toLowerCase();
  const filteredResults = useMemo(() => {
    return enrichedResults.filter((result) => {
      if (result.scope !== scopeFilter) return false;
      if (docTypeFilter !== "all" && result.docType !== docTypeFilter) return false;
      if (statusFilter !== "all" && result.statusKey !== statusFilter) return false;
      if (!matchesDateFilter(result.updatedAt, dateFilter)) return false;
      if (ownerFilterValue && !result.owner.toLowerCase().includes(ownerFilterValue)) return false;
      return true;
    });
  }, [enrichedResults, scopeFilter, docTypeFilter, statusFilter, dateFilter, ownerFilterValue]);

  const queryTokens = useMemo(() =>
    query
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean),
  [query]);

  const aiTopPicks = useMemo(() => filteredResults.slice(0, 3), [filteredResults]);
  const recentResults = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return filteredResults.filter((result) => {
      if (!result.updatedAt) return false;
      return result.updatedAt.getTime() >= cutoff;
    });
  }, [filteredResults]);
  const remainingResults = useMemo(() => {
    const topSet = new Set(aiTopPicks.map((item) => item.id));
    const recentSet = new Set(recentResults.map((item) => item.id));
    return filteredResults.filter((result) => !topSet.has(result.id) && !recentSet.has(result.id));
  }, [filteredResults, aiTopPicks, recentResults]);

  const ownerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of Object.values(documentsIndex)) {
      const owner = (doc?.metadata?.owner || doc.user_id || "未設定").trim() || "未設定";
      counts.set(owner, (counts.get(owner) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([owner, count]) => ({ owner, count }));
  }, [documentsIndex]);

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void performSearch();
    },
    [performSearch],
  );

  const handleHistoryClick = useCallback(
    (keyword: string) => {
      setQuery(keyword);
      void performSearch(keyword);
    },
    [performSearch],
  );

  const handleSuggestion = useCallback(
    (suggestion: AiSuggestion) => {
      if (suggestion.key === "summarize") {
        if (filteredResults.length === 0) return;
        const summary = buildSummary(filteredResults.slice(0, 3));
        setAiSummary(summary);
        setAiLog((prev) => [...prev, { role: "assistant", text: "代表的な資料を要約しました" }]);
        return;
      }
      if (suggestion.key === "company") {
        setScopeFilter("company");
        setAiLog((prev) => [...prev, { role: "assistant", text: "スコープを会社全体に切り替えました" }]);
        return;
      }
      if (suggestion.key === "draft") {
        setStatusFilter("draft");
        setAiLog((prev) => [...prev, { role: "assistant", text: "Draft の資料だけにしました" }]);
        return;
      }
      if (suggestion.key === "recent") {
        setDateFilter("7d");
        setAiLog((prev) => [...prev, { role: "assistant", text: "直近1週間の資料に絞りました" }]);
        return;
      }
      if (suggestion.key === "keyword-a") {
        const next = query.includes("A社") ? query : `${query} A社`.trim();
        setQuery(next);
        setAiLog((prev) => [...prev, { role: "assistant", text: "A社関連のキーワードを追加しました" }]);
        void performSearch(next);
        return;
      }
    },
    [filteredResults, performSearch, query],
  );

  const handleAiPromptSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = aiPrompt.trim();
      if (!value) return;
      let assistant = "フィルターを更新しました";
      const lower = value.toLowerCase();
      if (lower.includes("draft") || value.includes("下書き")) {
        setStatusFilter("draft");
        assistant = "Draft の資料だけを表示します";
      } else if (lower.includes("final") || value.includes("確定")) {
        setStatusFilter("final");
        assistant = "Final の資料だけを表示します";
      } else if (lower.includes("recent") || value.includes("最近")) {
        setDateFilter("7d");
        assistant = "直近7日の更新に絞りました";
      } else if (lower.includes("company") || value.includes("会社")) {
        setScopeFilter("company");
        assistant = "会社全体の資料を検索します";
      } else if (lower.includes("team") || value.includes("チーム")) {
        setScopeFilter("team");
        assistant = "チームスコープに切り替えました";
      } else if (lower.includes("summary") || value.includes("要約")) {
        if (filteredResults.length > 0) {
          const summary = buildSummary(filteredResults.slice(0, 3));
          setAiSummary(summary);
          assistant = "最新の結果を要約しました";
        } else {
          assistant = "要約できる資料がありません";
        }
      } else {
        setQuery(value);
        void performSearch(value);
        assistant = `"${value}" で検索します`;
      }
      setAiLog((prev) => [...prev, { role: "user", text: value }, { role: "assistant", text: assistant }]);
      setAiPrompt("");
    },
    [aiPrompt, filteredResults, performSearch],
  );

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Search</p>
              <h1 className="text-3xl font-semibold text-slate-900">資料検索</h1>
              <p className="text-sm text-slate-500">社内資料とNotebookを横断して目的の情報を探します。</p>
            </div>
            <div className="w-full lg:w-1/2">
              <form onSubmit={handleSearchSubmit} className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="例: A社 補助金 Draft"
                    className="w-full rounded-full border border-slate-200 py-2 pl-10 pr-4 text-sm"
                  />
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                </div>
                <button
                  type="submit"
                  className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={loading}
                >
                  {loading ? "検索中…" : "検索"}
                </button>
              </form>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {SCOPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setScopeFilter(option.value)}
                className={clsx(
                  "rounded-2xl border px-3 py-2 text-left text-sm",
                  scopeFilter === option.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700",
                )}
              >
                <p className="font-semibold">{option.label}</p>
                <p className={clsx("text-xs", scopeFilter === option.value ? "text-slate-200" : "text-slate-500")}>{option.helper}</p>
              </button>
            ))}
          </div>
        </header>

        <div className="mt-6 grid gap-4 lg:grid-cols-[260px,1fr,320px]">
          <FiltersSidebar
            docType={docTypeFilter}
            status={statusFilter}
            dateRange={dateFilter}
            ownerFilter={ownerFilter}
            onDocTypeChange={setDocTypeFilter}
            onStatusChange={setStatusFilter}
            onDateRangeChange={setDateFilter}
            onOwnerFilterChange={setOwnerFilter}
            ownerOptions={ownerOptions}
            documentsLoading={documentsLoading}
            documentsError={documentsError}
            history={history}
            onHistoryClick={handleHistoryClick}
          />
          <section className="space-y-4">
            <SearchStats
              total={filteredResults.length}
              rawTotal={enrichedResults.length}
              latency={latency}
              loading={loading}
              error={error}
            />
            {aiSummary ? <AiSummaryCard summary={aiSummary} /> : null}
            {filteredResults.length === 0 ? (
              <EmptyState query={query} loading={loading} />
            ) : (
              <div className="space-y-6">
                <ResultSection
                  title="AIのおすすめ"
                  description="関連度の高い上位3件"
                  results={aiTopPicks}
                  tokens={queryTokens}
                  notebookId={notebookId}
                />
                {recentResults.length > 0 ? (
                  <ResultSection
                    title="最近関連のある資料"
                    description="直近1週間で更新された資料"
                    results={recentResults}
                    tokens={queryTokens}
                    notebookId={notebookId}
                  />
                ) : null}
                <ResultSection
                  title="その他の資料"
                  description="残りの検索結果"
                  results={remainingResults}
                  tokens={queryTokens}
                  notebookId={notebookId}
                />
              </div>
            )}
          </section>
          <AiPanel
            suggestions={AI_SUGGESTIONS}
            onSuggestion={handleSuggestion}
            log={aiLog}
            prompt={aiPrompt}
            onPromptChange={setAiPrompt}
            onSubmit={handleAiPromptSubmit}
            currentScope={scopeFilter}
            includeGlobal={includeGlobal}
          />
        </div>
      </div>
    </Layout>
  );
}

function FiltersSidebar({
  docType,
  status,
  dateRange,
  ownerFilter,
  onDocTypeChange,
  onStatusChange,
  onDateRangeChange,
  onOwnerFilterChange,
  ownerOptions,
  documentsLoading,
  documentsError,
  history,
  onHistoryClick,
}: {
  docType: DocTypeFilter;
  status: StatusFilter;
  dateRange: DateFilter;
  ownerFilter: string;
  onDocTypeChange: (value: DocTypeFilter) => void;
  onStatusChange: (value: StatusFilter) => void;
  onDateRangeChange: (value: DateFilter) => void;
  onOwnerFilterChange: (value: string) => void;
  ownerOptions: Array<{ owner: string; count: number }>;
  documentsLoading: boolean;
  documentsError: string | null;
  history: string[];
  onHistoryClick: (value: string) => void;
}) {
  return (
    <aside className="space-y-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <FilterSection title="DocType">
        <div className="flex flex-wrap gap-2">
          {DOC_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onDocTypeChange(option.value)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs",
                docType === option.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </FilterSection>
      <FilterSection title="ステータス">
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onStatusChange(option.value)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs",
                status === option.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </FilterSection>
      <FilterSection title="更新日">
        <div className="grid grid-cols-2 gap-2">
          {DATE_RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onDateRangeChange(option.value)}
              className={clsx(
                "rounded-xl border px-3 py-2 text-left text-xs",
                dateRange === option.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </FilterSection>
      <FilterSection title="オーナー">
        <input
          type="text"
          value={ownerFilter}
          onChange={(event) => onOwnerFilterChange(event.target.value)}
          placeholder="名前で絞り込み"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        {documentsLoading ? <p className="text-xs text-slate-400">読込中…</p> : null}
        {documentsError ? <p className="text-xs text-rose-600">{documentsError}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {ownerOptions.map((option) => (
            <button
              key={option.owner}
              type="button"
              onClick={() => onOwnerFilterChange(option.owner)}
              className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600"
            >
              {option.owner} ({option.count})
            </button>
          ))}
        </div>
      </FilterSection>
      {history.length > 0 ? (
        <FilterSection title="最近の検索">
          <div className="flex flex-wrap gap-2">
            {history.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onHistoryClick(item)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600"
              >
                {item}
              </button>
            ))}
          </div>
        </FilterSection>
      ) : null}
    </aside>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{title}</p>
      <div className="mt-2 space-y-2 text-sm text-slate-600">{children}</div>
    </div>
  );
}

function SearchStats({ total, rawTotal, latency, loading, error }: { total: number; rawTotal: number; latency: number | null; loading: boolean; error: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">結果</p>
          <p className="text-lg font-semibold text-slate-900">{total} 件</p>
          <p className="text-xs text-slate-500">取得済み: {rawTotal} 件</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          {loading ? "検索中…" : latency ? `取得 ${Math.round(latency)} ms` : ""}
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

function AiSummaryCard({ summary }: { summary: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-sm">
      <p className="text-xs font-semibold uppercase">AIサマリー</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>
    </div>
  );
}

function AiPanel({
  suggestions,
  onSuggestion,
  log,
  prompt,
  onPromptChange,
  onSubmit,
  currentScope,
  includeGlobal,
}: {
  suggestions: AiSuggestion[];
  onSuggestion: (suggestion: AiSuggestion) => void;
  log: AiLogEntry[];
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  currentScope: ScopeFilter;
  includeGlobal: boolean;
}) {
  return (
    <aside className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">AIサーチヘルパー</p>
        <p className="text-xs text-slate-500">現在スコープ: {describeScope(currentScope)} / {includeGlobal ? "全社含む" : "限定"}</p>
      </div>
      <div className="space-y-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.key}
            type="button"
            onClick={() => onSuggestion(suggestion)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:border-slate-300 hover:bg-slate-50"
          >
            <p className="font-semibold text-slate-900">{suggestion.label}</p>
            <p className="text-xs text-slate-500">{suggestion.description}</p>
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 p-3">
        <div className="max-h-32 space-y-2 overflow-auto text-xs text-slate-500">
          {log.length === 0 ? <p>AIからの提案がここに表示されます。</p> : log.map((entry, index) => (
              <p key={index} className={entry.role === "assistant" ? "text-slate-800" : "text-slate-500"}>
                <span className="mr-1 font-semibold">{entry.role === "assistant" ? "AI" : "あなた"}</span>
                {entry.text}
              </p>
            ))}
        </div>
        <form onSubmit={onSubmit} className="mt-3 flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="例: Draftだけ"
            className="flex-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs"
          />
          <button type="submit" className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
            実行
          </button>
        </form>
      </div>
    </aside>
  );
}

function ResultSection({ title, description, results, tokens, notebookId }: { title: string; description: string; results: EnrichedResult[]; tokens: string[]; notebookId: string }) {
  const router = useRouter();
  if (results.length === 0) return null;
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className="space-y-3">
        {results.map((result) => (
          <ResultCard key={result.id} result={result} tokens={tokens} onAskNotebook={() => router.push(`/n/${encodeURIComponent(notebookId)}`)} />
        ))}
      </div>
    </div>
  );
}

function ResultCard({ result, tokens, onAskNotebook }: { result: EnrichedResult; tokens: string[]; onAskNotebook: () => void }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-0.5">{formatDocTypeLabel(result.docType)}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">{result.statusLabel}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">{describeScope(result.scope)}</span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">{result.title}</h3>
          <p className="text-xs text-slate-500">{result.path || "パス情報なし"}</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>関連度 {Math.round(Math.min(Math.max(result.score, 0), 1) * 100)}%</p>
          <p>{result.updatedAt ? formatUpdatedAt(result.updatedAt) : "更新日不明"}</p>
          <p>{result.owner}</p>
        </div>
      </div>
      <div className="mt-3 text-sm leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: highlightSnippet(result.snippet, tokens) }} />
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {result.page ? <span className="rounded-full border border-slate-200 px-3 py-1 text-slate-600">P.{result.page}</span> : null}
        <button
          type="button"
          className="rounded-full border border-slate-200 px-3 py-1 text-slate-600"
          onClick={onAskNotebook}
        >
          Notebookで質問
        </button>
      </div>
    </article>
  );
}

function EmptyState({ query, loading }: { query: string; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
      {loading ? "検索中です…" : query.trim() ? `"${query}" に一致する資料は見つかりませんでした。フィルターを緩めてみてください。` : "検索キーワードを入力してください。"}
    </div>
  );
}

function describeScope(scope: ScopeFilter) {
  switch (scope) {
    case "team":
      return "所属チーム";
    case "org":
      return "部署";
    case "company":
      return "会社全体";
    default:
      return "自分だけ";
  }
}

function matchesDateFilter(date: Date | null, filter: DateFilter) {
  if (filter === "any") return true;
  if (!date) return false;
  const diff = Date.now() - date.getTime();
  if (filter === "7d") return diff <= 7 * 24 * 60 * 60 * 1000;
  if (filter === "30d") return diff <= 30 * 24 * 60 * 60 * 1000;
  if (filter === "90d") return diff <= 90 * 24 * 60 * 60 * 1000;
  return true;
}

function normalizeDocumentSummary(doc: any): DocumentSummary {
  const metadata = typeof doc?.metadata === "object" && doc.metadata ? doc.metadata : null;
  return {
    doc_id: doc?.doc_id || doc?.document_id || doc?.id,
    title: doc?.title || metadata?.file_name || doc?.doc_id,
    user_id: doc?.user_id || metadata?.owner,
    notebook_id: doc?.notebook_id || doc?.notebook,
    is_global: Boolean(doc?.is_global),
    source_file_path: doc?.source_file_path || metadata?.nextcloud_path || metadata?.source,
    metadata,
    last_updated: typeof doc?.last_updated === "number" ? doc.last_updated : metadata?.updated_at ?? metadata?.last_ingest_ts ?? null,
  };
}

function enrichHit(hit: SearchHit, docs: Record<string, DocumentSummary>): EnrichedResult {
  const doc = docs[hit.file];
  const metadata = doc?.metadata || {};
  const title = doc?.title || hit.title || inferTitle(hit.file);
  const docType = inferDocType(metadata?.mime_type, title);
  const scope = deriveScope(doc, metadata);
  const owner = (metadata?.owner || doc?.user_id || "未設定").trim() || "未設定";
  const statusInfo = inferStatus(metadata?.status || metadata?.index_status);
  const updatedAt = deriveUpdatedAt(doc, metadata);
  const snippet = buildSnippet(hit);
  return {
    id: `${hit.file}::${hit.chunk}`,
    docId: hit.file,
    title,
    snippet,
    page: hit.page,
    score: hit.score,
    docType,
    scope,
    owner,
    updatedAt,
    statusKey: statusInfo.key,
    statusLabel: statusInfo.label,
    path: doc?.source_file_path,
  };
}

function buildSnippet(hit: SearchHit) {
  const before = hit.context_before ? hit.context_before.trim() + " … " : "";
  const after = hit.context_after ? " … " + hit.context_after.trim() : "";
  return `${before}${hit.snippet || ""}${after}`.trim();
}

function inferTitle(file: string) {
  const parts = file.split(":");
  return parts[parts.length - 1] || file;
}

function inferDocType(mime?: string, title?: string): DocTypeFilter {
  const value = `${mime || ""} ${title || ""}`.toLowerCase();
  if (value.includes("contract") || value.includes("agreement") || value.includes("契約")) return "contract";
  if (value.includes("ppt") || value.includes("presentation")) return "presentation";
  if (value.includes("xls") || value.includes("sheet")) return "sheet";
  if (value.includes("pdf")) return "pdf";
  if (value.includes("doc")) return "document";
  if (value.includes("note") || value.includes("md") || value.includes("txt")) return "note";
  return "other";
}

function deriveScope(doc?: DocumentSummary, metadata?: Record<string, any>): ScopeFilter {
  if (doc?.is_global) return "company";
  const notebook = (doc?.notebook_id || "").toLowerCase();
  const tags = (metadata?.scope || metadata?.tags || "").toString().toLowerCase();
  if (notebook.includes("org") || notebook.includes("dept") || tags.includes("org")) return "org";
  if (notebook.includes("team") || tags.includes("team")) return "team";
  if (notebook.includes("company")) return "company";
  return "personal";
}

function inferStatus(raw?: string): { key: StatusFilter | "other"; label: string } {
  const value = (raw || "").toLowerCase();
  if (!value) return { key: "other", label: "状態不明" };
  if (value.includes("draft") || value.includes("下書")) return { key: "draft", label: "Draft" };
  if (value.includes("review")) return { key: "review", label: "Review" };
  if (value.includes("final") || value.includes("確定")) return { key: "final", label: "Final" };
  return { key: "other", label: raw || "状態不明" };
}

function deriveUpdatedAt(doc?: DocumentSummary, metadata?: Record<string, any>): Date | null {
  const ts = typeof doc?.last_updated === "number" ? doc.last_updated : metadata?.updated_at ?? metadata?.last_ingest_ts;
  if (!ts) return null;
  const ms = ts > 1e12 ? ts : ts * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

function highlightSnippet(snippet: string, tokens: string[]) {
  const escaped = escapeHtml(snippet || "");
  if (tokens.length === 0) return escaped;
  let highlighted = escaped;
  for (const token of tokens) {
    if (!token) continue;
    const regex = new RegExp(`(${escapeRegExp(token)})`, "gi");
    highlighted = highlighted.replace(regex, '<mark class="bg-yellow-200 text-slate-900">$1</mark>');
  }
  return highlighted;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSummary(results: EnrichedResult[]) {
  return results
    .map((result, index) => `${index + 1}. ${result.title}\n   - ${trimSnippetForSummary(result.snippet)}`)
    .join("\n");
}

function trimSnippetForSummary(snippet: string) {
  const plain = snippet.replace(/<[^>]+>/g, "");
  return plain.length > 120 ? `${plain.slice(0, 120)}…` : plain;
}

function formatUpdatedAt(date: Date) {
  return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

function formatDocTypeLabel(type: DocTypeFilter) {
  const found = DOC_TYPE_OPTIONS.find((option) => option.value === type);
  return found ? found.label : "その他";
}

