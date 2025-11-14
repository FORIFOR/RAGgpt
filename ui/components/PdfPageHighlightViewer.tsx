"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { NormalizedRect } from "@/types/highlight";
import { pdfRectsToNormalized, denormalizeRects } from "@/lib/rect-normalize";

import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import { EventBus, PDFLinkService, PDFSinglePageViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import type { PageViewport } from "pdfjs-dist/types/src/display/display_utils";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import type { PDFViewerOptions } from "pdfjs-dist/types/web/pdf_viewer";

GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/4.10.38/pdf.worker.min.js";

const toInt = (value: unknown, fallback = 1): number => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
};

type PdfPageHighlightViewerProps = {
  src: string;
  targetPage?: number;
  pdfCoordRects?: Record<number, number[][]>;
  normRects?: Record<number, NormalizedRect[]>;
  /**
   * @deprecated Use `normRects` instead.
   */
  normalizedRects?: Record<number, NormalizedRect[]>;
  className?: string;
  onReadyChange?: (state: { ready: boolean; page: number }) => void;
  onRectPaint?: (info: { page: number; rects: number }) => void;
  onProgress?: (progress: { loaded: number; total: number | null }) => void;
  onError?: (message: string) => void;
};

export function PdfPageHighlightViewer({
  src,
  targetPage = 1,
  pdfCoordRects,
  normRects,
  normalizedRects,
  className,
  onReadyChange,
  onRectPaint,
  onProgress,
  onError,
}: PdfPageHighlightViewerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const viewerElementRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<PDFSinglePageViewer | null>(null);
  const viewerInitRef = useRef(false);
  const eventBusRef = useRef<EventBus | null>(null);
  const linkServiceRef = useRef<PDFLinkService | null>(null);
  const loadingTaskRef = useRef<ReturnType<typeof getDocument> | null>(null);
  const targetPageRef = useRef(targetPage);
  const onReadyChangeRef = useRef(onReadyChange);
 	const onProgressRef = useRef(onProgress);
 	const onErrorRef = useRef(onError);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const pdfRectsRef = useRef<Record<number, number[][]>>({});
  const normRectsRef = useRef<Record<number, NormalizedRect[]>>({});
  const providedNormRectsRef = useRef<Record<number, NormalizedRect[]>>(
    cloneNormalizedRectRecord(normRects ?? normalizedRects),
  );
  const paintRectsRef = useRef<(pageNumber?: number) => void>(() => {});
  const onRectPaintRef = useRef(onRectPaint);
  const generationRef = useRef(0);
  const initialNavigationDoneRef = useRef(false);
  const viewerReadyRef = useRef(false);
  const textSpanCacheRef = useRef<Record<number, TextSpanRect[]>>({});
  const invalidateTextSpanCache = useCallback((pageIndex?: number) => {
    if (typeof pageIndex === "number") {
      delete textSpanCacheRef.current[pageIndex];
      return;
    }
    textSpanCacheRef.current = {};
  }, []);
  const destroyActiveTask = useCallback(async () => {
    const activeTask = loadingTaskRef.current;
    loadingTaskRef.current = null;
    if (activeTask) {
      try {
        await activeTask.destroy();
      } catch (error) {
        console.warn("[PDF] failed to destroy loading task", error);
      }
    }
    const activeDoc = pdfDocRef.current;
    pdfDocRef.current = null;
    if (activeDoc) {
      try {
        await activeDoc.destroy();
      } catch (error) {
        console.warn("[PDF] failed to destroy pdf document", error);
      }
    }
  }, []);

  useEffect(() => {
    targetPageRef.current = toInt(targetPage, 1);
  }, [targetPage]);

  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
  }, [onReadyChange]);

  useEffect(() => {
    onRectPaintRef.current = onRectPaint;
  }, [onRectPaint]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const clampPageNumber = useCallback((value?: number | null) => {
    const fallback = toInt(value, 1);
    const doc = pdfDocRef.current;
    if (!doc) return Math.max(1, fallback || 1);
    return Math.min(Math.max(1, fallback || 1), doc.numPages || 1);
  }, []);

  const getPagesWithRects = useCallback(() => {
    const set = new Set<number>();
    Object.entries(pdfRectsRef.current).forEach(([key, rects]) => {
      if (Array.isArray(rects) && rects.length > 0) {
        set.add(Number(key) + 1);
      }
    });
    [providedNormRectsRef.current, normRectsRef.current].forEach((record) => {
      Object.entries(record).forEach(([key, rects]) => {
        if (Array.isArray(rects) && rects.length > 0) {
          set.add(Number(key) + 1);
        }
      });
    });
    return Array.from(set).filter((page) => Number.isFinite(page)).sort((a, b) => a - b);
  }, []);

const pickPageForView = useCallback(
  (preferTarget: boolean) => {
    const requested = clampPageNumber(targetPageRef.current ?? 1);
    const rectPages = getPagesWithRects();
    if (preferTarget || rectPages.length === 0) {
      return requested;
    }
    if (rectPages.includes(requested)) {
      return requested;
    }
    return clampPageNumber(rectPages[0] ?? requested);
  },
  [clampPageNumber, getPagesWithRects],
);

const syncViewerPage = useCallback(
    (pageNumber: number, opts?: { repaint?: boolean }) => {
      const viewer = viewerRef.current;
      if (!viewer || !pdfDocRef.current || !viewerReadyRef.current) return;
      const clamped = clampPageNumber(pageNumber);
      if (viewer.currentPageNumber !== clamped) {
        viewer.currentPageNumber = clamped;
      } else if (opts?.repaint !== false) {
        paintRectsRef.current(clamped);
      }
    },
    [clampPageNumber],
  );

const ensureHighlightLayer = (pageDiv: HTMLDivElement): HTMLDivElement => {
  pageDiv.classList.add("pdf-page-container");
  let layer = pageDiv.querySelector(".highlightLayer") as HTMLDivElement | null;
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "highlightLayer";
    pageDiv.appendChild(layer);
  }
  return layer;
};

const getNormalizedRectsForPage = (pageIndex: number, viewport: PageViewport): NormalizedRect[] => {
  const providedRecord = providedNormRectsRef.current;
  if (Object.prototype.hasOwnProperty.call(providedRecord, pageIndex)) {
    return providedRecord[pageIndex] ?? [];
  }

  if (!Object.prototype.hasOwnProperty.call(normRectsRef.current, pageIndex)) {
    const pdfRects = pdfRectsRef.current[pageIndex] ?? [];
    normRectsRef.current[pageIndex] = pdfRects.length
      ? pdfRectsToNormalized(pdfRects, viewport, pageIndex, "server")
      : [];
  }
  return normRectsRef.current[pageIndex] ?? [];
};

const renderHighlights = useCallback(
  (pageNumber?: number) => {
    const viewer = viewerRef.current;
    if (!viewer || !pdfDocRef.current) return;
    const target =
      typeof pageNumber === "number" ? clampPageNumber(pageNumber) : viewer.currentPageNumber;
    const pageIndex = target - 1;
    const pageView: any = viewer.getPageView?.(pageIndex);
    if (!pageView || !pageView.div || !pageView.pdfPage) return;

    const viewport: PageViewport =
      pageView.viewport ?? pageView.pdfPage.getViewport({ scale: pageView.scale });
    const layer = ensureHighlightLayer(pageView.div);
    layer.innerHTML = "";
    const pageBounds = pageView.div.getBoundingClientRect();
    const viewportSize = {
      width: pageBounds.width || viewport.width || 1,
      height: pageBounds.height || viewport.height || 1,
    };

    const normalized = getNormalizedRectsForPage(pageIndex, viewport);
    if (!normalized.length) {
      onRectPaintRef.current?.({ page: target, rects: 0 });
      return;
    }

    let boxes = denormalizeRects(normalized, viewportSize);
    boxes = snapRectsToTextSpans(
      boxes,
      pageView.div,
      pageIndex,
      textSpanCacheRef,
      viewportSize,
    );
    boxes
      .filter((box, idx, arr) => {
        if (box.source === "server") return true;
        // fallback boxes are only kept if there was no server rect
        return !arr.some((candidate) => candidate !== box && candidate.source === "server");
      })
      .forEach((box) => {
        const mark = document.createElement("div");
        mark.className = `hl-box ${box.source === "fallback" ? "hl--fallback" : "hl--server"}`;
        mark.style.left = `${box.abs.left}px`;
        mark.style.top = `${box.abs.top}px`;
        mark.style.width = `${box.abs.width}px`;
        mark.style.height = `${box.abs.height}px`;
        mark.dataset.id = box.id;
        layer.appendChild(mark);
      });

    (window as any).__hltdbg = () => ({
      page: target,
      server: boxes.length,
      ui: layer.querySelectorAll(".hl-box").length,
    });

    onRectPaintRef.current?.({ page: target, rects: boxes.length });
  },
  [clampPageNumber],
);

  useEffect(() => {
    paintRectsRef.current = (pageNumber?: number) => {
      renderHighlights(pageNumber);
    };
  }, [renderHighlights]);

  useEffect(() => {
    pdfRectsRef.current = pdfCoordRects ?? {};
    normRectsRef.current = {};
    if (viewerRef.current && viewerReadyRef.current) {
      const current = viewerRef.current.currentPageNumber;
      paintRectsRef.current(current);
      syncViewerPage(pickPageForView(false), { repaint: true });
    }
  }, [pdfCoordRects, pickPageForView, syncViewerPage]);

  useEffect(() => {
    providedNormRectsRef.current = cloneNormalizedRectRecord(normRects ?? normalizedRects);
    if (viewerRef.current && viewerReadyRef.current) {
      const current = viewerRef.current.currentPageNumber;
      paintRectsRef.current(current);
      syncViewerPage(pickPageForView(false), { repaint: true });
    }
  }, [normRects, normalizedRects, pickPageForView, syncViewerPage]);

  useEffect(() => {
    if (!pdfDocRef.current || !viewerRef.current) return;
    syncViewerPage(pickPageForView(false));
  }, [pickPageForView, syncViewerPage]);

  useEffect(() => {
    if (!pdfDocRef.current || !viewerRef.current) return;
    syncViewerPage(pickPageForView(true));
  }, [pickPageForView, syncViewerPage, targetPage]);

  useEffect(() => {
    initialNavigationDoneRef.current = false;
  }, [src]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const debugGetter = () => {
      const viewer = viewerRef.current;
      const page = viewer?.currentPageNumber ?? null;
      const pageView = viewer && page ? viewer.getPageView(page - 1) : null;
      const layer = pageView?.div?.querySelector(".highlightLayer") as HTMLElement | null;
      return {
        ready: !!(viewer && pageView),
        page,
        scale: viewer?._currentScale ?? null,
        pageDiv: !!pageView?.div,
        hlLayer: !!layer,
        hlCount: layer?.childElementCount ?? 0,
      };
    };
    (window as any).__pdfdbg = debugGetter;
    return () => {
      if ((window as any).__pdfdbg === debugGetter) delete (window as any).__pdfdbg;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const repaint = () => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      paintRectsRef.current(viewer.currentPageNumber);
    };
    (window as any).__repaintHL = repaint;
    return () => {
      if ((window as any).__repaintHL === repaint) delete (window as any).__repaintHL;
    };
  }, []);

  useEffect(() => {
    const container = viewerContainerRef.current;
    const viewerElement = viewerElementRef.current;
    if (!container || !viewerElement) return;
    if (viewerRef.current) return;
    if (viewerInitRef.current) return;
    viewerInitRef.current = true;

    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const viewerOptions: PDFViewerOptions & { enableScripting?: boolean } = {
      container,
      viewer: viewerElement,
      eventBus,
      linkService,
      textLayerMode: 2,
      annotationEditorMode: 0,
      enableScripting: false,
    };
    const viewer = new PDFSinglePageViewer(viewerOptions);
    linkService.setViewer(viewer);
    viewerRef.current = viewer;
    eventBusRef.current = eventBus;
    linkServiceRef.current = linkService;
    if (typeof window !== "undefined") {
      (window as any).__pdfViewer = viewer;
    }

    const handlePagesLoaded = () => {
      if (!pdfDocRef.current || initialNavigationDoneRef.current) return;
      viewer.currentScaleValue = "page-fit";
      viewerReadyRef.current = true;
      syncViewerPage(pickPageForView(true), { repaint: false });
      initialNavigationDoneRef.current = true;
    };
    const handlePageRendered = (evt: any) => {
      if (!pdfDocRef.current) return;
      if (typeof evt?.pageNumber === "number") {
        const idx = evt.pageNumber - 1;
        invalidateTextSpanCache(idx);
        paintRectsRef.current(evt.pageNumber);
        onReadyChangeRef.current?.({ ready: true, page: evt.pageNumber });
      }
    };
    const handleTextLayerRendered = (evt: any) => {
      if (!pdfDocRef.current) return;
      if (typeof evt?.pageNumber === "number") {
        const idx = evt.pageNumber - 1;
        invalidateTextSpanCache(idx);
        paintRectsRef.current(evt.pageNumber);
      }
    };
    const handleScaleChanged = () => {
      if (!pdfDocRef.current) return;
      invalidateTextSpanCache();
      paintRectsRef.current(viewer.currentPageNumber);
    };
    const handleScaleChanging = () => {
      invalidateTextSpanCache();
    };

    eventBus.on("pagesloaded", handlePagesLoaded);
    eventBus.on("pagerendered", handlePageRendered);
    eventBus.on("textlayerrendered", handleTextLayerRendered);
    eventBus.on("scalechanged", handleScaleChanged);
    eventBus.on("scalechanging", handleScaleChanging);

    return () => {
      eventBus.off("pagesloaded", handlePagesLoaded);
      eventBus.off("pagerendered", handlePageRendered);
      eventBus.off("textlayerrendered", handleTextLayerRendered);
      eventBus.off("scalechanged", handleScaleChanged);
      eventBus.off("scalechanging", handleScaleChanging);
      viewer.cleanup?.();
      viewerRef.current = null;
      linkServiceRef.current = null;
      eventBusRef.current = null;
      void destroyActiveTask();
      initialNavigationDoneRef.current = false;
      viewerReadyRef.current = false;
      viewerInitRef.current = false;
      if (typeof window !== "undefined" && (window as any).__pdfViewer === viewer) {
        delete (window as any).__pdfViewer;
      }
    };
  }, [destroyActiveTask, pickPageForView, syncViewerPage, invalidateTextSpanCache]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const linkService = linkServiceRef.current;
    if (!viewer || !linkService || !src) return;
    const abortController = new AbortController();

    let cancelled = false;
    const currentGeneration = generationRef.current + 1;
    generationRef.current = currentGeneration;

    const loadDocument = async () => {
      await destroyActiveTask();
      viewerReadyRef.current = false;
      initialNavigationDoneRef.current = false;

      const task = getDocument({
        url: src,
        disableStream: false,
        disableAutoFetch: true,
        rangeChunkSize: 1024 * 1024,
        cMapUrl: "/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdfjs/standard_fonts/",
        signal: abortController.signal,
      } as any);
      loadingTaskRef.current = task;

      task.onProgress = (progressData: { loaded: number; total?: number }) => {
        onProgressRef.current?.({
          loaded: progressData.loaded,
          total: typeof progressData.total === "number" ? progressData.total : null,
        });
      };

      try {
        const pdf = await task.promise;
        if (cancelled || currentGeneration !== generationRef.current) {
          try {
            await pdf.destroy();
          } catch (error) {
            console.warn("[PDF] failed to destroy stale pdf", error);
          }
          return;
        }
        pdfDocRef.current = pdf;
        linkService.setDocument(pdf, null);
        viewer.setDocument(pdf);
        viewerReadyRef.current = false;
      } catch (error) {
        if (cancelled || currentGeneration !== generationRef.current) return;
        console.error(error);
        onErrorRef.current?.(
          error instanceof Error ? error.message : "PDFの表示に失敗しました",
        );
      } finally {
        if (loadingTaskRef.current === task) {
          loadingTaskRef.current = null;
        }
      }
    };

    void loadDocument();

    return () => {
      cancelled = true;
      abortController.abort();
      void destroyActiveTask();
    };
  }, [pickPageForView, src, destroyActiveTask, syncViewerPage]);

  return (
    <div className={clsx("rag-pdf-host", className)}>
      <div
        ref={scrollRef}
        className="relative h-full w-full overflow-hidden bg-slate-50"
      >
        <div ref={viewerContainerRef} className="viewerContainer">
          <div ref={viewerElementRef} className="pdfViewer singlePageView" />
        </div>
      </div>
    </div>
  );
}

const ensureFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

function sanitizeNormalizedRect(
  rect: NormalizedRect,
  fallbackPageIndex: number,
  rectIdx: number,
): NormalizedRect | null {
  const x = ensureFiniteNumber(rect.x);
  const y = ensureFiniteNumber(rect.y);
  const width = ensureFiniteNumber(rect.width);
  const height = ensureFiniteNumber(rect.height);
  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  const pageIndex = Number.isFinite(rect.pageIndex) ? rect.pageIndex : fallbackPageIndex;
  return {
    ...rect,
    pageIndex,
    x,
    y,
    width,
    height,
    id: rect.id || `${pageIndex}-${rectIdx}`,
    source: rect.source ?? "server",
  };
}

function cloneNormalizedRectRecord(
  input?: Record<number | string, NormalizedRect[] | undefined>,
): Record<number, NormalizedRect[]> {
  if (!input) return {};
  const record: Record<number, NormalizedRect[]> = {};
  Object.entries(input).forEach(([key, rects]) => {
    const idx = Number(key);
    if (!Number.isFinite(idx) || !Array.isArray(rects)) return;
    const sanitized = rects
      .map((rect, rectIdx) => sanitizeNormalizedRect(rect, idx, rectIdx))
      .filter((entry): entry is NormalizedRect => Boolean(entry));
    if (sanitized.length) {
      record[idx] = sanitized;
    }
  });
  return record;
}

type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type TextSpanRect = RectLike & {
  key: string;
};

type HighlightBox = NormalizedRect & { abs: RectLike };

const SNAP_TOLERANCE_PX = 2;

function collectTextLayerSpans(
  pageIndex: number,
  pageDiv: HTMLDivElement,
  cacheRef: MutableRefObject<Record<number, TextSpanRect[]>>,
): TextSpanRect[] {
  const cached = cacheRef.current[pageIndex];
  if (cached) {
    return cached;
  }
  const textLayer = pageDiv.querySelector(".textLayer") as HTMLElement | null;
  if (!textLayer) return [];
  const spans = Array.from(textLayer.querySelectorAll("span"));
  if (!spans.length) return [];
  const pageBounds = pageDiv.getBoundingClientRect();
  if (!pageBounds.width || !pageBounds.height) return [];
  const rects = spans
    .map((span, idx) => {
      const rect = span.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) return null;
      return {
        key: span.dataset?.rectId ?? span.dataset?.geom ?? `${idx}`,
        left: rect.left - pageBounds.left,
        top: rect.top - pageBounds.top,
        width,
        height,
      };
    })
    .filter((entry): entry is TextSpanRect => Boolean(entry));
  cacheRef.current[pageIndex] = rects;
  return rects;
}

function snapRectsToTextSpans(
  boxes: HighlightBox[],
  pageDiv: HTMLDivElement,
  pageIndex: number,
  cacheRef: MutableRefObject<Record<number, TextSpanRect[]>>,
  viewportSize: { width: number; height: number },
): HighlightBox[] {
  if (!boxes.length) return boxes;
  const spans = collectTextLayerSpans(pageIndex, pageDiv, cacheRef);
  if (!spans.length) return boxes;
  const refWidth = viewportSize.width || 1;
  const refHeight = viewportSize.height || 1;
  const dedupe = new Set<string>();
  const snapped: HighlightBox[] = [];

  boxes.forEach((box) => {
    const hits = spans.filter((span) => rectsOverlap(span, box.abs, SNAP_TOLERANCE_PX));
    if (!hits.length) {
      snapped.push(box);
      return;
    }
    hits.forEach((span) => {
      const dedupeKey = `${box.id}-${span.key}`;
      if (dedupe.has(dedupeKey)) return;
      dedupe.add(dedupeKey);
      const left = span.left;
      const top = span.top;
      const width = span.width;
      const height = span.height;
      snapped.push({
        ...box,
        x: left / refWidth,
        y: top / refHeight,
        width: width / refWidth,
        height: height / refHeight,
        abs: { left, top, width, height },
      });
    });
  });

  return snapped.length ? snapped : boxes;
}

function rectsOverlap(a: RectLike, b: RectLike, tolerance = 0): boolean {
  const aRight = a.left + a.width;
  const aBottom = a.top + a.height;
  const bRight = b.left + b.width;
  const bBottom = b.top + b.height;
  return (
    aRight >= b.left - tolerance &&
    a.left <= bRight + tolerance &&
    aBottom >= b.top - tolerance &&
    a.top <= bBottom + tolerance
  );
}
