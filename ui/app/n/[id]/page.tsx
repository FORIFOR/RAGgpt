"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import useSWR from "swr";
import { toast } from "sonner";


import { SummaryProgressPanel } from "@/components/SummaryProgressPanel";
import { UploadPanel } from "@/components/UploadPanel";
import { apiFetch } from "@/lib/api";
import {
  DEFAULT_TENANT,
  DEFAULT_USER,
  resolveScope,
  Scope,
  setScope,
} from "@/lib/scope";
import {
  loadNotebookMeta,
  saveNotebookMeta,
  type NotebookMeta,
} from "@/lib/notebookMeta";
import {
  useConversationStore,
  type StoredMessage,
} from "@/lib/conversation-store";
import {
  buildSentenceAttribution,
  type SentenceSegment,
} from "@/lib/sentence-attribution";
import type { SummaryJobSnapshot } from "@/lib/summary-job";

const DocumentHighlightModal = nextDynamic(
  () =>
    import("@/components/DocumentHighlightModal").then(
      (mod) => mod.DocumentHighlightModal,
    ),
  { ssr: false },
);

type DocumentRecord = {
  doc_id: string;
  title?: string;
  source_file_path?: string;
  metadata?: Record<string, any>;
  file_name?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  segments?: SentenceSegment[];
  createdAt: number;
};

type Citation = {
  id?: string | number;
  doc_id?: string;
  title?: string;
  page?: number;
  uri?: string;
  snippet?: string;
  text?: string;
  quote?: string;
};

const swrFetcher = (url: string) => apiFetch(url);
const NON_CANCELABLE_SUMMARY_STATUSES = new Set([
  "done",
  "error",
  "canceled",
]);

const DEFAULT_LEFT_PANE_WIDTH = 300;
const DEFAULT_RIGHT_PANE_WIDTH = 320;
const MIN_LEFT_PANE_WIDTH = 220;
const MIN_RIGHT_PANE_WIDTH = 240;
const MIN_CENTER_PANE_WIDTH = 420;

type PanePosition = "left" | "right";
type PaneWidths = {
  left: number;
  right: number;
};

function areSetsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export default function NotebookPage({ params }: { params: { id: string } }) {
  const notebookId = decodeURIComponent(params.id);

  const [sessionContext, setSessionContext] = useState<{
    tenant: string;
    user: string;
    includeGlobal: boolean;
  } | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Message[]>([]);
  const [summaryJob, setSummaryJob] = useState<SummaryJobSnapshot | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [useSelectedOnly, setUseSelectedOnly] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [preview, setPreview] = useState<{
    docId: string;
    page?: number | null;
    snippet?: string | null;
    title?: string | null;
    queries?: string[];
  } | null>(null);
  const [meta, setMeta] = useState<NotebookMeta>(() => {
    if (typeof window === "undefined") {
      return { title: notebookId, updatedAt: Date.now() };
    }
    return loadNotebookMeta(notebookId);
  });
  const [titleDraft, setTitleDraft] = useState(meta.title);
  const [paneWidths, setPaneWidths] = useState<PaneWidths>({
    left: DEFAULT_LEFT_PANE_WIDTH,
    right: DEFAULT_RIGHT_PANE_WIDTH,
  });
  const [activeResizer, setActiveResizer] = useState<PanePosition | null>(null);
  const summaryPollingRef = useRef<{ stop: () => void } | null>(null);
  const remoteConversationLoadedRef = useRef(false);
  const lastSavedConversationRef = useRef<string>("[]");
  const conversationSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const resizeStateRef = useRef<{
    pane: PanePosition;
    startX: number;
    startLeft: number;
    startRight: number;
    containerWidth: number;
  } | null>(null);
  const setStoredMessages = useConversationStore((state) => state.setMessages);
  const setStoredSummaryJob = useConversationStore(
    (state) => state.setSummaryJob,
  );

  const scope = useMemo<Scope | null>(() => {
    if (!sessionContext) return null;
    try {
      return resolveScope(
        notebookId,
        sessionContext.tenant,
        sessionContext.user,
        sessionContext.includeGlobal,
      );
    } catch (error) {
      console.error(error);
      return null;
    }
  }, [sessionContext, notebookId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tenant =
      window.sessionStorage.getItem("tenant")?.trim() || DEFAULT_TENANT;
    const userId =
      window.sessionStorage.getItem("user_id")?.trim() || DEFAULT_USER;
    const includeGlobal = window.sessionStorage.getItem("include_global") === "1";
    setSessionContext((prev) => {
      if (
        prev &&
        prev.tenant === tenant &&
        prev.user === userId &&
        prev.includeGlobal === includeGlobal
      ) {
        return prev;
      }
      return { tenant, user: userId, includeGlobal };
    });
  }, [notebookId]);

  useEffect(() => {
    if (!scope) return;
    setScope(scope);
  }, [scope]);

  useEffect(() => {
    setMeta(loadNotebookMeta(notebookId));
  }, [notebookId]);

  useEffect(() => {
    setTitleDraft(meta.title);
  }, [meta.title]);

  const { data: docPayload, mutate: refreshDocuments } = useSWR(
    scope
      ? `/api/backend/documents?tenant=${scope.tenant}&user_id=${scope.user_id}&notebook_id=${scope.notebook_id}&include_global=${scope.include_global ? "true" : "false"}`
      : null,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const rawDocuments = docPayload?.documents;
  const documents: DocumentRecord[] = useMemo(
    () => (Array.isArray(rawDocuments) ? rawDocuments : []),
    [rawDocuments],
  );

  useEffect(() => {
    if (!Array.isArray(rawDocuments) || rawDocuments.length === 0) {
      setSelectedDocs((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    setSelectedDocs((prev) => {
      const next = new Set<string>();
      for (const doc of rawDocuments) {
        if (prev.has(doc.doc_id)) {
          next.add(doc.doc_id);
        }
      }
      return areSetsEqual(prev, next) ? prev : next;
    });
  }, [rawDocuments]);

  useEffect(() => {
    const stored = useConversationStore.getState().notebooks[notebookId];
    setMessages(stored ? deserializeMessages(stored.messages) : []);
    setSummaryJob(stored?.summaryJob ?? null);
  }, [notebookId]);

  useEffect(() => {
    setStoredMessages(notebookId, serializeMessages(messages));
  }, [messages, notebookId, setStoredMessages]);

  useEffect(() => {
    setStoredSummaryJob(notebookId, summaryJob);
  }, [summaryJob, notebookId, setStoredSummaryJob]);

  useEffect(() => {
    if (!scope) return;
    let aborted = false;
    setLoadingConversations(true);
    remoteConversationLoadedRef.current = false;
    void apiFetch("/api/backend/conversations", { method: "GET" })
      .then((payload) => {
        if (aborted) return;
        const remoteMessages = Array.isArray(payload?.messages)
          ? deserializeMessages(payload.messages)
          : [];
        if (remoteMessages.length > 0) {
          setMessages(remoteMessages);
        }
        lastSavedConversationRef.current = JSON.stringify(
          payload?.messages ?? [],
        );
      })
      .catch((error) => {
        if (!aborted) {
          console.error(error);
          toast.error("会話履歴の取得に失敗しました。");
        }
      })
      .finally(() => {
        if (aborted) return;
        remoteConversationLoadedRef.current = true;
        setLoadingConversations(false);
      });
    return () => {
      aborted = true;
    };
  }, [scope, apiFetch, toast, setMessages]);

  useEffect(() => {
    if (!scope) return undefined;
    if (!remoteConversationLoadedRef.current) return undefined;
    const serializedMessages = serializeMessages(messages);
    const payloadJson = JSON.stringify(serializedMessages);
    if (payloadJson === lastSavedConversationRef.current) {
      return undefined;
    }
    const timer = setTimeout(() => {
      void apiFetch("/api/backend/conversations", {
        method: "PUT",
        body: { messages: serializedMessages },
      })
        .then(() => {
          lastSavedConversationRef.current = payloadJson;
        })
        .catch((error) => {
          console.error(error);
          toast.error("会話履歴の保存に失敗しました。");
        });
    }, 1200);
    conversationSaveTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (conversationSaveTimerRef.current === timer) {
        conversationSaveTimerRef.current = null;
      }
    };
  }, [messages, scope, apiFetch, toast]);

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") {
        return messages[i];
      }
    }
    return undefined;
  }, [messages]);

  const updateMessageById = useCallback(
    (id: string, updater: (msg: Message) => Message) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === id ? updater(msg) : msg)),
      );
    },
    [],
  );

  const stopSummaryPolling = useCallback(() => {
    if (summaryPollingRef.current) {
      summaryPollingRef.current.stop();
      summaryPollingRef.current = null;
    }
  }, []);

  const pollSummaryJob = useCallback(
    (jobId: string, targetMessageId: string) => {
      stopSummaryPolling();
      let active = true;
      summaryPollingRef.current = {
        stop: () => {
          active = false;
        },
      };

      const loop = async () => {
        try {
          while (active) {
            const status = await apiFetch(
              `/api/backend/summarize/status/${encodeURIComponent(jobId)}`,
              { method: "GET" },
            );
            if (!active) return;

            const snapshot = normalizeSummarySnapshot(
              status,
              jobId,
              targetMessageId,
            );
            setSummaryJob(snapshot);
            const hasPartial = Boolean(
              snapshot.partialText && snapshot.partialText.trim().length > 0,
            );
            const progressText = hasPartial
              ? snapshot.partialText
              : buildSummaryProgressText(snapshot);
            updateMessageById(targetMessageId, (msg) => ({
              ...msg,
              content: progressText,
            }));

            if (status.status === "done" && status.result) {
              updateMessageById(targetMessageId, (msg) => ({
                ...msg,
                content:
                  (typeof status.result.summary === "string" &&
                    status.result.summary.trim()) ||
                  (typeof status.result.text === "string" &&
                    status.result.text.trim()) ||
                  "要約を生成できませんでした。",
                citations: Array.isArray(status.result.citations)
                  ? status.result.citations
                  : msg.citations,
              }));
              setSummaryJob(null);
              stopSummaryPolling();
              break;
            }

            if (status.status === "canceled") {
              updateMessageById(targetMessageId, (msg) => ({
                ...msg,
                content: "要約はキャンセルされました。",
              }));
              setSummaryJob(null);
              stopSummaryPolling();
              break;
            }

            if (status.status === "error") {
              const err =
                snapshot.error || sanitizeSummaryError(status.error);
              throw new Error(err);
            }

            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        } catch (error) {
          if (!active) return;
          console.error(error);
          const message =
            error instanceof Error && error.message
              ? error.message
              : "要約の進捗取得に失敗しました。";
          toast.error("要約の進捗取得に失敗しました。");
          updateMessageById(targetMessageId, (msg) => ({
            ...msg,
            content: `要約に失敗しました: ${message}`,
          }));
          setSummaryJob((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              status: "error",
              phase: prev.phase ?? "error",
              error: prev.error ?? message,
              updatedAt: Date.now(),
            };
          });
          stopSummaryPolling();
        }
      };

      void loop();
    },
    [apiFetch, stopSummaryPolling, updateMessageById, toast],
  );

  useEffect(
    () => () => {
      stopSummaryPolling();
    },
    [stopSummaryPolling],
  );

  const activeJobIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!summaryJob?.id) {
      activeJobIdRef.current = null;
      stopSummaryPolling();
      return;
    }
    if (activeJobIdRef.current === summaryJob.id) {
      return;
    }
    activeJobIdRef.current = summaryJob.id;
    pollSummaryJob(summaryJob.id, summaryJob.messageId);
  }, [summaryJob, pollSummaryJob, stopSummaryPolling]);

  const toggleDocument = useCallback((docId: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  }, []);

  const persistTitle = useCallback(() => {
    setMeta((prev) => {
      const nextTitle = titleDraft.trim() || notebookId;
      if (prev.title === nextTitle) return prev;
      const next = { ...prev, title: nextTitle, updatedAt: Date.now() };
      saveNotebookMeta(notebookId, next);
      return next;
    });
  }, [titleDraft, notebookId]);

  const handleTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        (event.target as HTMLInputElement | null)?.blur();
      }
    },
    [],
  );

  const handleDocumentReady = useCallback(
    (doc: any) => {
      if (!doc) return;
      setMeta((prev) => {
        const currentTitle = prev.title?.trim();
        if (currentTitle && currentTitle !== notebookId) {
          return prev;
        }
        const candidate =
          (doc.title?.trim() ||
            doc.metadata?.title?.trim() ||
            doc.metadata?.file_name?.replace(/\.[^.]+$/, "") ||
            doc.source_file_path?.split("/").pop()?.replace(/\.[^.]+$/, "") ||
            doc.doc_id?.split(":").pop() ||
            doc.doc_id)?.slice(0, 80);
        if (!candidate) {
          return prev;
        }
        const next = { ...prev, title: candidate, updatedAt: Date.now() };
        saveNotebookMeta(notebookId, next);
        return next;
      });
    },
    [notebookId],
  );

  const canSend = useMemo(() => {
    if (!scope) return false;
    const trimmed = input.trim();
    if (trimmed.length === 0) return false;
    if (sending || isUploading) return false;
    if (useSelectedOnly && selectedDocs.size === 0) return false;
    return true;
  }, [
    scope,
    input,
    sending,
    isUploading,
    useSelectedOnly,
    selectedDocs,
  ]);

  const handleSend = useCallback(async () => {
    if (!scope) return;
    const question = input.trim();
    if (!question || sending) return;
    const selectedIds = Array.from(selectedDocs);
    if (useSelectedOnly && selectedIds.length === 0) {
      toast.info("左ペインで資料を選択してください");
      return;
    }
    setSending(true);

    const userMessage: Message = {
      id: `user_${createId()}`,
      role: "user",
      content: question,
      createdAt: Date.now(),
    };
    const assistantMessage: Message = {
      id: `assistant_${createId()}`,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");

    const payload: Record<string, any> = {
      tenant: scope.tenant,
      user_id: scope.user_id,
      notebook_id: scope.notebook_id,
      include_global: scope.include_global ?? false,
      query: question,
      stream: true,
    };

    if (selectedIds.length > 0) {
      payload.selected_ids = selectedIds;
    }

    const shouldSummarize =
      detectSummarizeIntent(question) && selectedIds.length > 0;

    const updateAssistant = (updater: (msg: Message) => Message) => {
      updateMessageById(assistantMessage.id, updater);
    };

    if (shouldSummarize) {
      stopSummaryPolling();
      try {
        updateAssistant((msg) => ({
          ...msg,
          content: "要約処理を開始しました…",
        }));
        const startResponse = await apiFetch("/api/backend/summarize/start", {
          method: "POST",
          body: {
            doc_ids: selectedIds,
            query: question,
          },
        });
        const jobId = startResponse.job_id;
        if (!jobId || typeof jobId !== "string") {
          throw new Error("job_id not issued");
        }
        const timestamp = Date.now();
        setSummaryJob({
          id: jobId,
          messageId: assistantMessage.id,
          progress: 0,
          status: "queued",
          phase: "queue",
          startedAt: timestamp,
          updatedAt: timestamp,
        });
        pollSummaryJob(jobId, assistantMessage.id);
      } catch (error) {
        console.error(error);
        toast.error("要約の生成に失敗しました。");
        setMessages((prev) =>
          prev.filter(
            (msg) =>
              msg.id !== userMessage.id && msg.id !== assistantMessage.id,
          ),
        );
        setSummaryJob(null);
      } finally {
        setSending(false);
      }
      return;
    }

    try {
      const response = await apiFetch("/api/backend/generate", {
        method: "POST",
        body: payload,
        raw: true,
      });

      if (!response.body) {
        throw new Error("ストリームを受信できませんでした");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let assistantContentBuffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const segments = buffer.split("\n\n");
        buffer = segments.pop() ?? "";

        for (const segment of segments) {
          const dataLine = segment
            .split("\n")
            .find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          const payloadString = dataLine.slice(5).trim();
          if (!payloadString || payloadString === "[DONE]") continue;

          let event: any;
          try {
            event = JSON.parse(payloadString);
          } catch {
            continue;
          }

          const appendedText =
            typeof event.delta === "string"
              ? event.delta
              : typeof event.text === "string"
                ? event.text
                : typeof event.token === "string"
                  ? event.token
                  : "";

          if (appendedText) {
            assistantContentBuffer += appendedText;
            updateAssistant((msg) => ({
              ...msg,
              content: assistantContentBuffer,
            }));
          }

          if (event.type === "final" && Array.isArray(event.citations)) {
            const attribution = buildSentenceAttribution(
              assistantContentBuffer.trim(),
              event.citations,
            );
            updateAssistant((msg) => ({
              ...msg,
              citations: attribution.citations,
              segments: attribution.segments,
            }));
            continue;
          }

          if (Array.isArray(event.citations)) {
            updateAssistant((msg) => ({
              ...msg,
              citations: event.citations,
            }));
          }
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("生成に失敗しました。もう一度お試しください。");
      setMessages((prev) =>
        prev.filter(
          (msg) =>
            msg.id !== userMessage.id && msg.id !== assistantMessage.id,
        ),
      );
    } finally {
      setSending(false);
    }
  }, [
    scope,
    input,
    sending,
    useSelectedOnly,
    selectedDocs,
    apiFetch,
    toast,
    updateMessageById,
    pollSummaryJob,
    stopSummaryPolling,
  ]);

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleSend();
    },
    [handleSend],
  );

  const handleCancelSummary = useCallback(async () => {
    if (!summaryJob) return;
    try {
      await apiFetch("/api/backend/summarize/cancel", {
        method: "POST",
        body: { job_id: summaryJob.id },
      });
      toast.info("要約をキャンセルしました。");
    } catch (error) {
      console.error(error);
      toast.error("キャンセルに失敗しました。");
      return;
    }
    stopSummaryPolling();
    setSummaryJob(null);
    updateMessageById(summaryJob.messageId, (msg) => ({
      ...msg,
      content: "要約はキャンセルされました。",
    }));
  }, [
    summaryJob,
    apiFetch,
    stopSummaryPolling,
    updateMessageById,
    toast,
  ]);

  const handlePreviewCitation = useCallback(
    (citation: Citation) => {
      if (!citation.doc_id || !scope) return;
      const queries = buildHighlightQueries(citation);
      setPreview({
        docId: citation.doc_id,
        page: citation.page ?? null,
        snippet: citation.snippet || citation.text || citation.title || null,
        title: citation.title || citation.doc_id,
        queries,
      });
    },
    [scope],
  );

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const state = resizeStateRef.current;
    if (!state) return;
    let nextLeft = state.startLeft;
    let nextRight = state.startRight;
    if (state.pane === "left") {
      const delta = event.clientX - state.startX;
      const maxLeft =
        state.containerWidth - state.startRight - MIN_CENTER_PANE_WIDTH;
      const boundedMax = Math.max(MIN_LEFT_PANE_WIDTH, maxLeft);
      nextLeft = clampWidth(
        state.startLeft + delta,
        MIN_LEFT_PANE_WIDTH,
        boundedMax,
      );
    } else if (state.pane === "right") {
      const delta = event.clientX - state.startX;
      const maxRight =
        state.containerWidth - state.startLeft - MIN_CENTER_PANE_WIDTH;
      const boundedMax = Math.max(MIN_RIGHT_PANE_WIDTH, maxRight);
      nextRight = clampWidth(
        state.startRight - delta,
        MIN_RIGHT_PANE_WIDTH,
        boundedMax,
      );
    }
    setPaneWidths((prev) => {
      if (prev.left === nextLeft && prev.right === nextRight) {
        return prev;
      }
      return { left: nextLeft, right: nextRight };
    });
  }, []);

  const stopResizing = useCallback(() => {
    resizeStateRef.current = null;
    setActiveResizer(null);
    if (typeof window === "undefined") return;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopResizing);
  }, [handlePointerMove]);

  const startResizing = useCallback(
    (pane: PanePosition) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!layoutRef.current || typeof window === "undefined") return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = layoutRef.current.getBoundingClientRect();
      resizeStateRef.current = {
        pane,
        startX: event.clientX,
        startLeft: paneWidths.left,
        startRight: paneWidths.right,
        containerWidth: bounds.width,
      };
      setActiveResizer(pane);
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResizing);
    },
    [handlePointerMove, paneWidths.left, paneWidths.right, stopResizing],
  );

  const clampWidthsToContainer = useCallback(() => {
    if (!layoutRef.current) return;
    const { width } = layoutRef.current.getBoundingClientRect();
    setPaneWidths((prev) => {
      let nextLeft = clampWidth(
        prev.left,
        MIN_LEFT_PANE_WIDTH,
        Math.max(
          MIN_LEFT_PANE_WIDTH,
          width - prev.right - MIN_CENTER_PANE_WIDTH,
        ),
      );
      let nextRight = clampWidth(
        prev.right,
        MIN_RIGHT_PANE_WIDTH,
        Math.max(
          MIN_RIGHT_PANE_WIDTH,
          width - nextLeft - MIN_CENTER_PANE_WIDTH,
        ),
      );
      if (nextLeft === prev.left && nextRight === prev.right) {
        return prev;
      }
      return { left: nextLeft, right: nextRight };
    });
  }, [layoutRef]);

  useEffect(() => {
    return () => {
      stopResizing();
    };
  }, [stopResizing]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    clampWidthsToContainer();
    window.addEventListener("resize", clampWidthsToContainer);
    return () => {
      window.removeEventListener("resize", clampWidthsToContainer);
    };
  }, [clampWidthsToContainer]);

  return (
    <div className="vhfix flex h-[calc(100dvh-var(--app-header-height))] min-h-[calc(100dvh-var(--app-header-height))] flex-col bg-slate-50">
      <div ref={layoutRef} className="flex flex-1 overflow-hidden">
        <aside
          className="flex shrink-0 flex-col gap-4 border-r border-slate-200 bg-white p-4"
          style={{ width: `${paneWidths.left}px` }}
        >
          {scope ? (
            <UploadPanel
              scope={scope}
              onBusyChange={setIsUploading}
              onCompleted={() => void refreshDocuments()}
              onDocumentReady={handleDocumentReady}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-400">
              スコープを初期化しています…
            </div>
          )}
          <DocumentList
            documents={documents}
            selected={selectedDocs}
            onToggle={toggleDocument}
          />
          <StorageUsageCard scope={scope} />
        </aside>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="資料ペインの幅を調整"
          tabIndex={-1}
          onPointerDown={startResizing("left")}
          className={clsx(
            "relative z-10 flex w-2 shrink-0 cursor-col-resize select-none items-stretch bg-transparent transition-colors",
            activeResizer === "left"
              ? "bg-sky-100"
              : "hover:bg-slate-100 active:bg-sky-100",
          )}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-4 left-1/2 w-px -translate-x-1/2 bg-slate-300"
          />
        </div>

        <main className="min-w-0 flex-1 bg-white">
          <div className="grid h-full grid-rows-[auto,1fr,auto]">
            <div className="border-b border-slate-200 bg-white">
              <header className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col gap-1">
                  <input
                    className="w-full max-w-xl border-b border-transparent bg-transparent text-xl font-semibold text-slate-900 focus:border-slate-300 focus:outline-none"
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={persistTitle}
                    onKeyDown={handleTitleKeyDown}
                    aria-label="ノートタイトル"
                  />
                  <span className="text-xs text-slate-400">
                    ID: {notebookId}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  選択中 {selectedDocs.size} 件 / 資料 {documents.length} 件
                </p>
              </header>
              {summaryJob ? (
                <SummaryProgressPanel
                  job={summaryJob}
                  onCancel={
                    NON_CANCELABLE_SUMMARY_STATUSES.has(
                      summaryJob.status ?? "",
                    )
                      ? undefined
                      : handleCancelSummary
                  }
                  disabled={sending}
                />
              ) : null}
              {loadingConversations ? (
                <div className="px-6 py-1 text-xs text-slate-400">
                  会話履歴を同期しています…
                </div>
              ) : null}
            </div>

            <section className="overflow-auto bg-slate-50">
              <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-4">
                {messages.length === 0 ? (
                  <div className="rounded-md border bg-white px-3 py-2 text-[14px] text-slate-600">
                    左ペインで資料を選び、質問を入力してください。
                  </div>
                ) : null}
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={clsx(
                      "rounded-2xl border p-4 text-sm leading-6 shadow-sm",
                      message.role === "assistant"
                        ? "border-blue-100 bg-white"
                        : "border-slate-200 bg-white",
                    )}
                  >
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {message.role === "assistant" ? "回答" : "質問"}
                    </div>
                    <AssistantContent message={message} />
                    {message.citations && message.citations.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {message.citations.map((citation, idx) => (
                          <div
                            key={`${citation.id ?? idx}`}
                            className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600"
                          >
                            <div className="font-semibold text-slate-500">
                              [{idx + 1}] {citation.title || citation.doc_id}
                            </div>
                            {citation.snippet ? (
                              <p className="mt-1 text-[11px] text-slate-500">
                                {citation.snippet}
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handlePreviewCitation(citation)}
                                className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                disabled={!citation.doc_id || !scope}
                              >
                                該当箇所を表示
                              </button>
                              {(() => {
                                const href = buildPdfUrl(scope, citation.doc_id);
                                if (href) {
                                  return (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded border border-slate-200 px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50"
                                    >
                                      PDFを開く
                                    </a>
                                  );
                                }
                                if (citation.uri) {
                                  return (
                                    <a
                                      href={citation.uri}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded border border-slate-200 px-2 py-1 text-[11px] text-blue-400 hover:bg-slate-50"
                                    >
                                      PDFを開く
                                    </a>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            <div className="border-t border-slate-200 bg-white">
              <div className="mx-auto w-full max-w-[1200px] px-4 py-3">
                <form
                  onSubmit={handleFormSubmit}
                  className="flex items-end gap-2"
                >
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder={
                      isUploading
                        ? "資料を処理中です。完了後に質問できます…"
                        : "質問を書いて、Ctrl / ⌘ + Enter で送信…"
                    }
                    className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-[14px] leading-6 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                    rows={3}
                  />
                  <button
                    type="submit"
                    disabled={sending || !canSend}
                    className="h-[44px] shrink-0 rounded-md bg-slate-900 px-5 text-white transition disabled:opacity-40"
                  >
                    {sending ? "送信中…" : "送信"}
                  </button>
                </form>
                <div className="mt-2 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={useSelectedOnly}
                      onChange={(event) =>
                        setUseSelectedOnly(event.target.checked)
                      }
                    />
                    選択した資料だけを使う
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Ctrl / ⌘ + Enter で送信
                  </span>
                </div>
              </div>
            </div>
          </div>
        </main>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="ハイライトペインの幅を調整"
          tabIndex={-1}
          onPointerDown={startResizing("right")}
          className={clsx(
            "relative z-10 flex w-2 shrink-0 cursor-col-resize select-none items-stretch bg-transparent transition-colors",
            activeResizer === "right"
              ? "bg-sky-100"
              : "hover:bg-slate-100 active:bg-sky-100",
          )}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-4 left-1/2 w-px -translate-x-1/2 bg-slate-300"
          />
        </div>

        <aside
          className="flex shrink-0 flex-col border-l border-slate-200 bg-white"
          style={{ width: `${paneWidths.right}px` }}
        >
          <div className="sticky top-[64px] h-[calc(100vh-88px)] overflow-auto pr-1">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">
              最新の出典
            </div>
            <CitationsPanel message={lastAssistantMessage} scope={scope} />
          </div>
        </aside>
      </div>
      <DocumentHighlightModal
        open={Boolean(preview && scope)}
        scope={scope}
        docId={preview?.docId}
        page={preview?.page ?? undefined}
        snippet={preview?.snippet ?? undefined}
        title={preview?.title ?? undefined}
        queries={preview?.queries}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

function DocumentList({
  documents,
  selected,
  onToggle,
}: {
  documents: DocumentRecord[];
  selected: Set<string>;
  onToggle: (docId: string) => void;
}) {
  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        まだ資料がありません。上の「資料を追加」からアップロードしてください。
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <ul className="space-y-2">
        {documents.map((doc) => {
          const isSelected = selected.has(doc.doc_id);
          const secondary =
            doc.source_file_path?.split("/").pop() ||
            doc.file_name ||
            doc.doc_id;
          return (
            <li
              key={doc.doc_id}
              className={clsx(
                "list-focus rounded-xl border px-3 py-3 text-sm shadow-sm transition",
                isSelected
                  ? "border-sky-500 bg-sky-50"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
              )}
              data-selected={isSelected ? "true" : undefined}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(doc.doc_id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">
                    {doc.title || doc.doc_id}
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {secondary}
                  </div>
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StorageUsageCard({ scope }: { scope: Scope | null }) {
  const { data, error, isLoading } = useSWR(
    scope ? "/api/backend/usage" : null,
    swrFetcher,
    { refreshInterval: 60000 },
  );

  if (!scope) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-400">
        スコープ情報を読み込んでいます…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">
        ストレージ情報の取得に失敗しました。
      </div>
    );
  }

  const storage = data?.storage;
  const documentsCount = data?.documents ?? 0;
  const capacity = storage?.capacity_bytes ?? 0;
  const usedDocuments = storage?.documents_bytes ?? 0;
  const usedConversations = storage?.conversations_bytes ?? 0;
  const usedTotal = storage?.total_bytes ?? usedDocuments + usedConversations;
  const remaining = storage?.remaining_bytes ?? Math.max(capacity - usedTotal, 0);
  const percent = capacity > 0 ? Math.min(100, (usedTotal / capacity) * 100) : 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
      <div className="flex items-center justify-between text-[12px] font-semibold text-slate-700">
        <span>ストレージ使用量</span>
        <span>
          {formatBytes(usedTotal)} / {capacity ? formatBytes(capacity) : "∞"}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-slate-500 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <dl className="mt-3 space-y-1 text-[11px]">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">資料</dt>
          <dd className="font-semibold text-slate-800">
            {formatBytes(usedDocuments)} ({documentsCount} 件)
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">会話</dt>
          <dd className="font-semibold text-slate-800">
            {formatBytes(usedConversations)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">残り</dt>
          <dd className="font-semibold text-slate-800">{formatBytes(remaining)}</dd>
        </div>
      </dl>
      {isLoading ? (
        <div className="mt-2 text-[10px] text-slate-400">更新中…</div>
      ) : null}
    </div>
  );
}

function AssistantContent({ message }: { message: Message }) {
  if (
    message.role === "assistant" &&
    message.segments &&
    message.segments.length > 0 &&
    message.citations &&
    message.citations.length > 0
  ) {
    return (
      <div className="space-y-3 text-base leading-7 text-slate-900">
        {message.segments.map((segment, index) => (
          <p key={`${message.id}_segment_${index}`} className="text-slate-900">
            {segment.text}
            {segment.citationIndices.map((citationIndex) => (
              <sup
                key={`${message.id}_segment_${index}_cit_${citationIndex}`}
                className="ml-1 text-xs font-semibold text-blue-600"
              >
                [{citationIndex + 1}]
              </sup>
            ))}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="whitespace-pre-wrap text-base text-slate-900">
      {message.content || (message.role === "assistant" ? "..." : "")}
    </div>
  );
}

function CitationsPanel({ message, scope }: { message?: Message; scope: Scope | null }) {
  const citations = message?.citations ?? [];
  if (citations.length === 0) {
    return (
      <div className="flex-1 px-4 py-6 text-sm text-slate-400">
        直近の回答に出典はありません。
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-4">
      <ul className="space-y-3">
        {citations.map((citation, index) => {
          const pdfUrl = buildPdfUrl(scope, citation.doc_id);
          return (
            <li key={`${citation.id ?? citation.doc_id ?? index}`}>
              <div className="list-focus rounded-lg border border-slate-200 bg-white p-3 text-sm transition hover:border-slate-300 hover:bg-slate-50">
                <div className="text-xs font-semibold text-slate-500">
                  [{index + 1}] p.{citation.page ?? "?"}
                </div>
                <div className="mt-1 font-medium text-slate-700">
                  {citation.title || citation.doc_id || "出典"}
                </div>
                {pdfUrl ? (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-2 text-xs text-blue-600 hover:underline"
                  >
                    原文を開く
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function buildPdfUrl(scope: Scope | null, docId?: string | null): string | null {
  if (!scope || !docId) return null;
  const params = new URLSearchParams({
    tenant: scope.tenant,
    user_id: scope.user_id,
    notebook_id: scope.notebook_id,
    include_global: scope.include_global ? "true" : "false",
  });
  return `/api/backend/docs/${encodeURIComponent(docId)}/pdf?${params.toString()}`;
}

function normalizeQueryFragment(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/[\s\u00A0]+/g, " ")
    .replace(/^[\-–—•・\s]+/, "")
    .trim();
}

function splitSentences(value: string): string[] {
  const matches = value.match(/[^。.!?！？]+[。.!?！？]?/g);
  if (!matches) return [value];
  return matches.map((item) => item.trim()).filter(Boolean);
}

function buildHighlightQueries(citation: Citation): string[] {
  const seeds = [citation.snippet, citation.text, citation.quote];
  const queries: string[] = [];
  seeds.forEach((seed) => {
    const normalized = normalizeQueryFragment(seed);
    if (!normalized) return;
    queries.push(normalized);
    if (normalized.length > 80) {
      queries.push(normalized.slice(0, 80));
      queries.push(normalized.slice(-80));
    }
    splitSentences(normalized)
      .filter((fragment) => fragment.length >= 10)
      .slice(0, 3)
      .forEach((fragment) => queries.push(fragment));
  });
  return Array.from(new Set(queries.filter((entry) => entry.length > 0))).slice(0, 8);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function serializeMessages(messages: Message[]): StoredMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    citations: msg.citations,
    segments: msg.segments,
    createdAt: msg.createdAt,
  }));
}

function deserializeMessages(stored?: StoredMessage[]): Message[] {
  if (!stored) return [];
  return stored.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    citations: msg.citations,
    segments: msg.segments,
    createdAt: msg.createdAt,
  }));
}

const SUMMARY_PHASE_LABELS: Record<string, string> = {
  queue: "待機中",
  retrieval: "検索中",
  map: "分割要約",
  reduce: "統合要約",
  done: "完了",
  error: "エラー",
};

function clampJobProgress(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function buildSummaryProgressText(job: SummaryJobSnapshot): string {
  const label = SUMMARY_PHASE_LABELS[job.phase ?? "queue"] ?? "進行中";
  const percent = clampJobProgress(job.progress);
  const hint = job.hint?.trim() ? `\nヒント: ${job.hint.trim()}` : "";
  return `要約処理中… ${label} (${percent.toFixed(0)}%)${hint}`;
}

function sanitizeSummaryError(raw: unknown): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw;
  }
  if (typeof raw === "object") {
    const payload = raw as Record<string, unknown>;
    for (const key of ["error", "detail", "message", "hint"]) {
      const value = payload[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
  }
  return undefined;
}

function isSummaryObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeSummarySnapshot(
  status: Record<string, any>,
  jobId: string,
  messageId: string,
): SummaryJobSnapshot {
  const phaseValue = typeof status.phase === "string" ? status.phase : undefined;
  const allowedPhases = Object.keys(SUMMARY_PHASE_LABELS);
  const normalizedPhase = allowedPhases.includes(phaseValue ?? "")
    ? (phaseValue as SummaryJobSnapshot["phase"])
    : undefined;
  const metrics = isSummaryObject(status.metrics) ? status.metrics : undefined;
  return {
    id: jobId,
    messageId,
    status: typeof status.status === "string" ? status.status : undefined,
    phase: normalizedPhase,
    progress:
      typeof status.progress === "number" && !Number.isNaN(status.progress)
        ? status.progress
        : undefined,
    partialText:
      typeof status.partial_text === "string" ? status.partial_text : undefined,
    hint: typeof status.hint === "string" ? status.hint : undefined,
    error: sanitizeSummaryError(status.error),
    metrics,
    startedAt:
      typeof status.started_at === "number" && !Number.isNaN(status.started_at)
        ? status.started_at
        : undefined,
    updatedAt:
      typeof status.updated_at === "number" && !Number.isNaN(status.updated_at)
        ? status.updated_at
        : Date.now(),
  };
}

function detectSummarizeIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const collapsed = normalized.replace(/[。\s!?！？]/g, "");
  const patterns = [
    /^要約$/,
    /^要約して$/,
    /^要約してください$/,
    /^まとめ$/,
    /^まとめて$/,
    /^まとめてください$/,
    /^要点$/,
    /^要点を教えて$/,
    /^要点だけ$/,
    /^ダイジェスト$/,
    /^ダイジェストで$/,
    /^summarize$/,
    /^summarizeplease$/,
    /^summaryplease$/,
  ];
  return patterns.some((regex) => regex.test(collapsed));
}

function clampWidth(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function clsx(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(" ");
}

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
