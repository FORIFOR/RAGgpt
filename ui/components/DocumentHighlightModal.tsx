"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Scope } from "@/lib/scope";

import { PdfPageHighlightViewer } from "@/components/PdfPageHighlightViewer";
import { buildScopeQuery } from "@/lib/scope";

type RawRect = [number, number, number, number, string?];

type ServerRectBundle = {
  page: number;
  rects: RawRect[];
  pageHeight?: number;
  pageWidth?: number;
  source?: "server" | "fallback";
};

type DocumentHighlightModalProps = {
  open: boolean;
  scope: Scope | null;
  docId?: string | null;
  page?: number | null;
  snippet?: string | null;
  anchorPhrase?: string | null;
  title?: string | null;
  queries?: string[] | null;
  onClose: () => void;
};

export function DocumentHighlightModal({
  open,
  scope,
  docId,
  page,
  snippet,
  anchorPhrase,
  title,
  queries,
  onClose,
}: DocumentHighlightModalProps) {
  const initialPage = useMemo(() => toPositivePage(page), [page]);
  const [highlightFound, setHighlightFound] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [resolvedTargetPage, setResolvedTargetPage] = useState(initialPage);
  const [progress, setProgress] = useState<{ loaded: number; total: number | null } | null>(
    null,
  );
  const [pageReady, setPageReady] = useState(false);
  const [rectFetchPending, setRectFetchPending] = useState(false);
  const [rectFetchError, setRectFetchError] = useState<string | null>(null);
  const [, setRectBundles] = useState<ServerRectBundle[]>([]);
  const [pdfRectMap, setPdfRectMap] = useState<Record<number, number[][]>>({});
  const rectDebugRef = useRef<any>(null);

  const scopeQuery = useMemo(() => {
    if (!scope) return "";
    const params = new URLSearchParams(buildScopeQuery(scope));
    return params.toString();
  }, [scope]);

  const pdfUrl = useMemo(() => {
    if (!docId || !scopeQuery) return null;
    return `/api/backend/docs/${encodeURIComponent(docId)}/pdf?${scopeQuery}`;
  }, [docId, scopeQuery]);

  const highlightSeed = anchorPhrase ?? snippet ?? "";
  const snippetJaOnly = useMemo(() => extractJapaneseOnly(highlightSeed), [highlightSeed]);
  const phrase = useMemo(() => {
    const normalized = nfkcJa(highlightSeed);
    if (normalized) return normalized;
    return nfkcJa(snippetJaOnly);
  }, [highlightSeed, snippetJaOnly]);
  const cjkTerms = useMemo(() => (highlightSeed ? buildCjkTerms(highlightSeed) : []), [highlightSeed]);
  const latinFallback = useMemo(
    () => latinFallbackTerms(highlightSeed, queries),
    [highlightSeed, queries],
  );
  const rectTerms = useMemo(
    () => mergeTerms(cjkTerms, latinFallback),
    [cjkTerms, latinFallback],
  );
  const rectTermsKey = useMemo(() => rectTerms.join("|"), [rectTerms]);
  const rectInputKey = useMemo(() => `${phrase}|${rectTermsKey}`, [phrase, rectTermsKey]);
  const hasRectInputs = phrase.length > 0 || rectTerms.length > 0;
  const displaySnippet = snippet ?? anchorPhrase ?? null;
  const setRectDebugState = useCallback((state: any) => {
    rectDebugRef.current = state;
    if (typeof window !== "undefined") {
      (window as any).__pdfrectdbgData = state;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as any).__pdfrectdbg = () => (window as any).__pdfrectdbgData;
    return () => {
      delete (window as any).__pdfrectdbg;
      delete (window as any).__pdfrectdbgData;
    };
  }, []);

  useEffect(() => {
    setRectBundles([]);
    setPdfRectMap({});
    setPageReady(false);
    setHighlightFound(false);
    setResolvedTargetPage(initialPage);
    setRectDebugState(null);
  }, [pdfUrl, initialPage, setRectDebugState]);

  useEffect(() => {
    if (!open) {
      setHighlightFound(false);
      setViewerError(null);
      setProgress(null);
      setPageReady(false);
      setRectFetchPending(false);
      setRectFetchError(null);
      setRectBundles([]);
      setPdfRectMap({});
      setCurrentPage(initialPage);
      setResolvedTargetPage(initialPage);
      setRectDebugState(null);
    }
  }, [open, initialPage, setRectDebugState]);

  const pagesToTry = useMemo(() => {
    const base = toPositivePage(initialPage);
    const offsets = [0, -1, 1, -2, 2];
    const seen = new Set<number>();
    const candidates: number[] = [];
    offsets.forEach((offset) => {
      const value = base + offset;
      if (value > 0 && !seen.has(value)) {
        seen.add(value);
        candidates.push(value);
      }
    });
    return candidates;
  }, [initialPage]);

  useEffect(() => {
    if (!open) {
      setCurrentPage(resolvedTargetPage);
    }
  }, [open, resolvedTargetPage]);

  useEffect(() => {
    if (open) {
      setCurrentPage(resolvedTargetPage);
    }
  }, [open, resolvedTargetPage]);

  useEffect(() => {
    if (!open) return;
    setViewerError(null);
    setProgress(null);
    setPageReady(false);
    setRectFetchError(null);
  }, [open, pdfUrl]);

  useEffect(() => {
    setHighlightFound(false);
    setPageReady(false);
    setRectBundles([]);
    setPdfRectMap({});
  }, [rectInputKey]);

  useEffect(() => {
    const numericInitial = toPositivePage(initialPage);
    if (!open || !docId || !scopeQuery || !hasRectInputs) {
      setRectBundles([]);
      setPdfRectMap({});
      setRectFetchPending(false);
      setRectFetchError(null);
      setRectDebugState({
        targetPage: numericInitial,
        rectPages: [],
        url: null,
        payload: null,
        error: open ? "missing-params" : "modal-closed",
        requestedPage: numericInitial,
        triedPages: [],
        pickedPage: null,
        serverRectsCount: 0,
      });
      return;
    }

    let cancelled = false;
    const controllers: AbortController[] = [];
    const candidateList = pagesToTry.length ? pagesToTry : [numericInitial];

    const fetchForPage = async (pageNumber: number, triedSnapshot: number[]) => {
      const params = new URLSearchParams(scopeQuery || "");
      params.set("doc_id", docId);
      params.set("page", String(pageNumber));
      params.set("debug", DOC_RECTS_DEBUG_FLAG);
      if (phrase) {
        params.set("phrase", phrase);
      } else {
        params.delete("phrase");
      }
      params.delete("terms");
      rectTerms.forEach((term) => params.append("terms", term));
      const controller = new AbortController();
      controllers.push(controller);
      const rectUrl = `/api/backend/docs/rects?${params.toString()}`;
      setRectDebugState({
        url: rectUrl,
        requestedPage: pageNumber,
        triedPages: triedSnapshot,
        pickedPage: null,
        rectPages: [],
        serverRectsCount: 0,
      });
      const response = await fetch(rectUrl, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      const bundles = normalizeRectResponse(payload);
      const rectPages = bundles.map((bundle) => ({
        page: bundle.page,
        rects: (bundle.rects ?? []).map((rect) => rect.slice(0, 4).map(Number)),
      }));
      const serverRectsCount = bundles.reduce(
        (sum, bundle) => sum + (bundle.rects?.length ?? 0),
        0,
      );
      const reason = payload?.reason;
      return {
        rectUrl,
        payload,
        bundles,
        rectPages,
        serverRectsCount,
        reason,
        pageNumber,
        triedSnapshot,
      };
    };

    const run = async () => {
      setRectFetchPending(true);
      setRectFetchError(null);
      setPageReady(false);
      setHighlightFound(false);
      const tried: number[] = [];
      for (const candidate of candidateList) {
        if (cancelled) return;
        tried.push(candidate);
        const snapshot = tried.slice();
        try {
          const {
            rectUrl,
            payload,
            bundles,
            rectPages,
            serverRectsCount,
            reason,
          } = await fetchForPage(candidate, snapshot);
          if (cancelled) return;
          if (reason === "doc_not_in_notebook") {
            setRectBundles([]);
            setPdfRectMap({});
            setRectFetchError("ノートとドキュメントの組み合わせが一致しません。");
            setRectDebugState({
              targetPage: candidate,
              rectPages: [],
              url: rectUrl,
              payload,
              error: reason,
              requestedPage: candidate,
              triedPages: snapshot,
              pickedPage: null,
              serverRectsCount,
            });
            return;
          }
          if (serverRectsCount > 0) {
            setRectBundles(bundles);
            setPdfRectMap(bundlesToPdfRectMap(bundles));
            setRectFetchError(null);
            const targetFromPayload = resolveTargetPage(payload, bundles, candidate);
            const numericTarget = toPositivePage(targetFromPayload);
            setResolvedTargetPage(numericTarget);
            setCurrentPage(numericTarget);
            setRectDebugState({
              targetPage: numericTarget,
              rectPages,
              url: rectUrl,
              payload,
              error: null,
              requestedPage: candidate,
              triedPages: snapshot,
              pickedPage: numericTarget,
              serverRectsCount,
            });
            return;
          }
          setRectDebugState({
            targetPage: candidate,
            rectPages,
            url: rectUrl,
            payload,
            error: reason ?? null,
            requestedPage: candidate,
            triedPages: snapshot,
            pickedPage: null,
            serverRectsCount,
          });
        } catch (error) {
          if (cancelled || (error as Error).name === "AbortError") {
            return;
          }
          console.warn("rect fetch failed", error);
          const message = error instanceof Error ? error.message : String(error);
          setRectBundles([]);
          setPdfRectMap({});
          setRectFetchError(message);
          setRectDebugState({
            targetPage: candidate,
            rectPages: [],
            url: null,
            payload: null,
            error: message,
            requestedPage: candidate,
            triedPages: snapshot,
            pickedPage: null,
            serverRectsCount: 0,
          });
          return;
        }
      }

      if (!cancelled) {
        setRectBundles([]);
        setPdfRectMap({});
        setRectFetchError("該当するハイライトが見つかりませんでした。");
        setRectDebugState({
          targetPage: numericInitial,
          rectPages: [],
          url: null,
          payload: null,
          error: "no_server_rects",
          requestedPage: candidateList[candidateList.length - 1] ?? numericInitial,
          triedPages: tried,
          pickedPage: null,
          serverRectsCount: 0,
        });
      }
    };

    run()
      .catch((error) => {
        if (cancelled) return;
        console.warn("rect fetch failed", error);
        const message = error instanceof Error ? error.message : String(error);
        setRectBundles([]);
        setPdfRectMap({});
        setRectFetchError(message);
        setRectDebugState({
          targetPage: numericInitial,
          rectPages: [],
          url: null,
          payload: null,
          error: message,
          requestedPage: numericInitial,
          triedPages: [],
          pickedPage: null,
          serverRectsCount: 0,
        });
      })
      .finally(() => {
        if (!cancelled) {
          setRectFetchPending(false);
        }
      });

    return () => {
      cancelled = true;
      controllers.forEach((controller) => controller.abort());
    };
  }, [
    open,
    docId,
    scopeQuery,
    rectTerms,
    initialPage,
    phrase,
    hasRectInputs,
    setRectDebugState,
    pagesToTry,
  ]);

  if (!open || !scope || !docId) {
    return null;
  }

  const waiting =
    Boolean(pdfUrl) && (!pageReady || rectFetchPending) && !viewerError;
  const noInputs = !hasRectInputs;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-full w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">{title || "原文プレビュー"}</p>
            <p className="text-xs text-slate-500">p.{currentPage}</p>
          </div>
          <div className="flex items-center gap-2">
            {pdfUrl ? (
              <a
                className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
              >
                PDFを新規タブで開く
              </a>
            ) : null}
            <button
              onClick={onClose}
              className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              閉じる
            </button>
          </div>
        </div>
        <div className="max-h-[80vh] overflow-auto bg-slate-50 p-4">
          <div className="relative mx-auto h-[75vh] w-[min(95vw,960px)]">
            {pdfUrl ? (
              <>
                <div
                  className="rag-modal h-full w-full rounded border border-slate-200 bg-white"
                  data-ready={pageReady ? "true" : "false"}
                >
                  <PdfPageHighlightViewer
                      className="h-full w-full"
                      src={pdfUrl}
                      targetPage={resolvedTargetPage}
                      pdfCoordRects={pdfRectMap}
                      onReadyChange={(state) => {
                        if (typeof state?.page === "number") {
                          setCurrentPage(state.page);
                        }
                        if (state?.ready) {
                          setPageReady(true);
                        }
                      }}
                    onRectPaint={({ page: rectPage, rects }) => {
                      setPageReady(true);
                      setHighlightFound(rects > 0);
                      if (typeof rectPage === "number") {
                        setCurrentPage(rectPage);
                      }
                    }}
                    onError={(message) => {
                      setViewerError(message);
                      setPageReady(true);
                    }}
                    onProgress={(value) => setProgress(value)}
                  />
                </div>
                {waiting && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded bg-white/80 text-sm text-slate-500">
                    {progress && progress.total
                      ? `読み込み中… ${Math.min(
                          100,
                          Math.round((progress.loaded / progress.total) * 100),
                        )}%`
                      : "ハイライトを準備中…"}
                  </div>
                )}
              </>
            ) : (
              <div className="rag-modal flex h-full w-full items-center justify-center rounded border border-slate-200 bg-white text-sm text-slate-500">
                PDFを取得できませんでした。
              </div>
            )}
          </div>
          {displaySnippet ? (
            <p className="mt-3 text-center text-xs text-slate-500">{displaySnippet}</p>
          ) : null}
          {viewerError ? (
            <p className="mt-4 text-center text-xs text-red-600">{viewerError}</p>
          ) : null}
          {rectFetchPending ? (
            <p className="mt-2 text-center text-[11px] text-slate-400">ハイライト位置を解析中…</p>
          ) : null}
          {rectFetchError ? (
            <p className="mt-2 text-center text-[11px] text-slate-500">
              ハイライト位置の取得に失敗しました: {rectFetchError}
            </p>
          ) : null}
          {!waiting && !viewerError && !noInputs && !highlightFound ? (
            <div className="mt-4 text-center text-xs text-slate-500">
              <p className="mb-1">サーバー側で該当箇所が見つかりませんでした。</p>
              <p>資料やページが異なる可能性があります。前後のページや別資料をご確認ください。</p>
            </div>
          ) : null}
          {!waiting && !viewerError && noInputs ? (
            <p className="mt-4 text-center text-xs text-slate-500">
              ハイライト用の日本語フレーズやキーワードが取得できませんでした。
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const DOC_RECTS_DEBUG_FLAG =
  process.env.NEXT_PUBLIC_DOCS_RECTS_DEBUG === "0" ? "0" : "1";
const MAX_CJK_GRAM = 6;
const MIN_CJK_GRAM = 3;
const MAX_CJK_TERMS = 6;
const MAX_LATIN_TERMS = 6;
const JAPANESE_ONLY_RE = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FFーｰ]/gu;
const CJK_DETECTION_RE = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/u;
const LATIN_TOKEN_RE = /[A-Za-z0-9][A-Za-z0-9._\-\/]{2,}/g;
function nfkcJa(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFKC")
    .replace(/```/g, "")
    .replace(/\$begin:math:display\$|\$end:math:display\$/g, "")
    .replace(/\s+/g, "")
    .replace(/[‐–—]/g, "-");
}

function extractJapaneseOnly(input: string): string {
  if (!input) return "";
  const matches = input.match(JAPANESE_ONLY_RE);
  return matches ? matches.join("") : "";
}

function buildCjkTerms(input: string, max = MAX_CJK_TERMS): string[] {
  if (!input) return [];
  const compact = nfkcJa(input);
  if (!compact) return [];
  const terms: string[] = [];
  for (let n = MAX_CJK_GRAM; n >= MIN_CJK_GRAM && terms.length < max; n -= 1) {
    for (let idx = 0; idx + n <= compact.length; idx += 1) {
      const slice = compact.slice(idx, idx + n);
      if (!CJK_DETECTION_RE.test(slice)) continue;
      terms.push(slice);
      if (terms.length >= max) break;
    }
  }
  return Array.from(new Set(terms)).slice(0, max);
}

function latinFallbackTerms(
  snippet?: string | null,
  queries?: string[] | null,
  max = MAX_LATIN_TERMS,
): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  const collect = (text: string | null | undefined) => {
    if (!text) return;
    const normalized = text.normalize("NFKC");
    const matches = normalized.match(LATIN_TOKEN_RE);
    if (!matches) return;
    for (const token of matches) {
      const clean = token.trim();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      terms.push(clean);
      if (terms.length >= max) return;
    }
  };

  collect(snippet);
  (queries ?? []).forEach((entry) => collect(entry));
  return terms.slice(0, max);
}

function mergeTerms(primary: string[], secondary: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  [...primary, ...secondary].forEach((term) => {
    const value = term?.trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    merged.push(value);
  });
  return merged;
}

function normalizeRectResponse(payload: any): ServerRectBundle[] {
  if (!payload) return [];
  const looksLikePageEntry = (entry: any) =>
    entry && typeof entry === "object" && !Array.isArray(entry) && ("rects" in entry || "page" in entry);

  const entries: any[] = Array.isArray(payload?.pages)
    ? payload.pages
    : Array.isArray(payload?.rect_pages)
      ? payload.rect_pages
      : Array.isArray(payload?.rects) && payload.rects.every((entry: any) => looksLikePageEntry(entry))
        ? payload.rects
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload)
            ? payload
            : [];

  const bundles: ServerRectBundle[] = [];
  entries.forEach((entry) => {
    const page = toNumber(entry?.page ?? payload?.page);
    if (!page || page <= 0) return;
    const rawRects = Array.isArray(entry?.rects) ? entry.rects : [];
    const rects = rawRects
      .map((rect: any) => convertRect(rect))
      .filter((item): item is RawRect => Boolean(item));
    if (!rects.length) return;
    const pageHeight = toNumber(entry?.h ?? entry?.height ?? payload?.h ?? payload?.height) ?? undefined;
    const pageWidth = toNumber(entry?.w ?? entry?.width ?? payload?.w ?? payload?.width) ?? undefined;
    const entryEngine = entry?.engine ?? payload?.engine ?? payload?.impl ?? null;
    bundles.push({
      page: Math.floor(page),
      rects,
      pageHeight,
      pageWidth,
      source: entryEngine ? "server" : "fallback",
    });
  });

  if (!bundles.length && Array.isArray(payload?.rects) && payload.rects.every((r: any) => Array.isArray(r))) {
    const fallbackRects = payload.rects
      .map((rect: any) => convertRect(rect))
      .filter((item): item is RawRect => Boolean(item));
    if (fallbackRects.length) {
      bundles.push({
        page: toNumber(payload?.page) ?? 1,
        rects: fallbackRects,
        pageHeight: toNumber(payload?.h ?? payload?.height) ?? undefined,
        pageWidth: toNumber(payload?.w ?? payload?.width) ?? undefined,
        source: "fallback",
      });
    }
  }

  return bundles.sort((a, b) => a.page - b.page);
}

function convertRect(rect: any): RawRect | null {
  if (Array.isArray(rect) && rect.length >= 4) {
    const [x1, y1, x2, y2, term] = rect;
    if ([x1, y1, x2, y2].every((value) => Number.isFinite(Number(value)))) {
      return [
        Number(x1),
        Number(y1),
        Number(x2),
        Number(y2),
        typeof term === "string" ? term : undefined,
      ];
    }
    return null;
  }
  if (rect && typeof rect === "object") {
    const x1 = toNumber(rect.x1 ?? rect.x ?? rect.left ?? rect.x0);
    const y1 = toNumber(rect.y1 ?? rect.y ?? rect.top ?? rect.y0);
    let x2 = toNumber(rect.x2 ?? rect.right ?? rect.x1);
    let y2 = toNumber(rect.y2 ?? rect.bottom ?? rect.y1);
    const width = toNumber(rect.width);
    const height = toNumber(rect.height);
    if (!Number.isFinite(x2) && Number.isFinite(x1) && Number.isFinite(width)) {
      x2 = (x1 as number) + (width as number);
    }
    if (!Number.isFinite(y2) && Number.isFinite(y1) && Number.isFinite(height)) {
      y2 = (y1 as number) + (height as number);
    }
    if ([x1, y1, x2, y2].every((value) => Number.isFinite(value))) {
      return [
        x1 as number,
        y1 as number,
        x2 as number,
        y2 as number,
        typeof rect.term === "string" ? rect.term : undefined,
      ];
    }
  }
  return null;
}

function toNumber(value: any): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toPositivePage(value?: number | null): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 1;
  return Math.max(1, Math.floor(num));
}

function resolveTargetPage(
  payload: any,
  bundles: ServerRectBundle[],
  fallback: number,
): number {
  const explicit = toNumber(payload?.page);
  if (explicit && explicit > 0) {
    return Math.floor(explicit);
  }
  if (bundles.length > 0) {
    return bundles[0].page;
  }
  return fallback > 0 ? fallback : 1;
}

function bundlesToPdfRectMap(bundles: ServerRectBundle[]): Record<number, number[][]> {
  const map: Record<number, number[][]> = {};
  bundles.forEach((bundle) => {
    const pageIndex = Math.max(0, Math.floor(bundle.page) - 1);
    const rects = (bundle.rects ?? []).map((rect) => rect.slice(0, 4).map(Number));
    if (!rects.length) return;
    map[pageIndex] = (map[pageIndex] || []).concat(rects);
  });
  return map;
}
