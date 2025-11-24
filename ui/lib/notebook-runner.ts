import { toast } from "sonner";

import { apiFetch } from "./api";
import { useConversationStore } from "./conversation-store";
import type { Scope } from "./scope";
import type { SummaryJobSnapshot } from "./summary-job";
import { buildSentenceAttribution } from "./sentence-attribution";

import type { NotebookMessage } from "@/types/notebook-conversation";

type GenerationOptions = {
  notebookId: string;
  scope: Scope;
  question: string;
  selectedIds: string[];
  assistantMessageId: string;
  userMessageId: string;
};

type SummaryOptions = {
  notebookId: string;
  scope: Scope;
  docIds: string[];
  question: string;
  assistantMessageId: string;
  userMessageId: string;
};

const FINAL_SUMMARY_STATUSES = new Set(["done", "error", "canceled"]);

class NotebookRunner {
  private generationControllers = new Map<string, AbortController>();
  private summaryPollers = new Map<
    string,
    { stop: () => void; notebookId: string; retries: number }
  >();
  private unsubscribe?: () => void;

  constructor() {
    if (typeof window !== "undefined") {
      this.unsubscribe = useConversationStore.subscribe((state) => {
        this.syncSummaryPollers(state.notebooks);
      });
      this.syncSummaryPollers(useConversationStore.getState().notebooks);
    }
  }

  async generateAnswer(options: GenerationOptions) {
    const controller = new AbortController();
    this.generationControllers.set(options.assistantMessageId, controller);
    try {
      const payload: Record<string, unknown> = {
        query: options.question,
        stream: true,
      };
      if (options.selectedIds.length > 0) {
        payload.selected_ids = options.selectedIds;
      }
      const response = await apiFetch("/api/backend/generate", {
        method: "POST",
        body: payload,
        raw: true,
        scope: options.scope,
        signal: controller.signal,
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
            updateMessage(options.notebookId, options.assistantMessageId, (msg) => ({
              ...msg,
              content: assistantContentBuffer,
            }));
          }

          if (event.type === "final" && Array.isArray(event.citations)) {
            const attribution = buildSentenceAttribution(
              assistantContentBuffer.trim(),
              event.citations,
            );
            updateMessage(options.notebookId, options.assistantMessageId, (msg) => ({
              ...msg,
              citations: attribution.citations,
              segments: attribution.segments,
            }));
            continue;
          }

          if (Array.isArray(event.citations)) {
            updateMessage(options.notebookId, options.assistantMessageId, (msg) => ({
              ...msg,
              citations: event.citations ?? msg.citations,
            }));
          }
        }
      }
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        return;
      }
      console.error(error);
      toast.error("生成に失敗しました。もう一度お試しください。");
      removeMessages(options.notebookId, (msg) =>
        msg.id === options.userMessageId || msg.id === options.assistantMessageId,
      );
      throw error;
    } finally {
      this.generationControllers.delete(options.assistantMessageId);
    }
  }

  async startSummary(options: SummaryOptions) {
    try {
      const response = await apiFetch("/api/backend/summarize/start", {
        method: "POST",
        body: { doc_ids: options.docIds, query: options.question },
        scope: options.scope,
      });
      const jobId = response?.job_id;
      if (!jobId || typeof jobId !== "string") {
        throw new Error("job_id not issued");
      }
      const timestamp = Date.now();
      const snapshot: SummaryJobSnapshot = {
        id: jobId,
        messageId: options.assistantMessageId,
        progress: 0,
        status: "queued",
        phase: "queue",
        startedAt: timestamp,
        updatedAt: timestamp,
        scope: options.scope,
      };
      useConversationStore.getState().setSummaryJob(options.notebookId, snapshot);
      this.launchSummaryPoller(options.notebookId, snapshot);
    } catch (error) {
      console.error(error);
      toast.error("要約の生成に失敗しました。");
      removeMessages(options.notebookId, (msg) =>
        msg.id === options.userMessageId || msg.id === options.assistantMessageId,
      );
      useConversationStore.getState().setSummaryJob(options.notebookId, null);
      throw error;
    }
  }

  async cancelSummary(notebookId: string) {
    const job = useConversationStore.getState().notebooks[notebookId]?.summaryJob;
    if (!job?.id) return;
    if (!job.scope) {
      toast.error("要約のスコープ情報が不足しています。");
      return;
    }
    try {
      await apiFetch("/api/backend/summarize/cancel", {
        method: "POST",
        body: { job_id: job.id },
        scope: job.scope,
      });
      toast.info("要約をキャンセルしました。");
    } catch (error) {
      console.error(error);
      toast.error("キャンセルに失敗しました。");
      throw error;
    }
    this.stopSummaryPoller(job.id);
    useConversationStore.getState().setSummaryJob(notebookId, null);
    updateMessage(notebookId, job.messageId, (msg) => ({
      ...msg,
      content: "要約はキャンセルされました。",
    }));
  }

  private syncSummaryPollers(
    notebooks: Record<string, { summaryJob?: SummaryJobSnapshot | null }>,
  ) {
    const activeIds = new Set<string>();
    Object.entries(notebooks).forEach(([notebookId, conversation]) => {
      const job = conversation.summaryJob;
      if (job?.id && !FINAL_SUMMARY_STATUSES.has(job.status ?? "")) {
        activeIds.add(job.id);
        if (!this.summaryPollers.has(job.id)) {
          this.launchSummaryPoller(notebookId, job);
        }
      }
    });

    Array.from(this.summaryPollers.entries()).forEach(([jobId, entry]) => {
      if (!activeIds.has(jobId)) {
        entry.stop();
        this.summaryPollers.delete(jobId);
      }
    });
  }

  private launchSummaryPoller(notebookId: string, job: SummaryJobSnapshot) {
    if (!job.id || !job.scope) {
      return;
    }
    let active = true;
    const pollKey = job.id;
    const stop = () => {
      active = false;
    };
    this.summaryPollers.set(pollKey, { stop, notebookId, retries: 0 });

    const loop = async () => {
      while (active) {
        try {
          const status = await apiFetch(
            `/api/backend/summarize/status/${encodeURIComponent(job.id)}`,
            {
              method: "GET",
              scope: job.scope,
            },
          );
          if (!active) return;
          const snapshot = normalizeSummarySnapshot(
            status,
            job.id,
            job.messageId,
            job.scope,
          );
          useConversationStore.getState().setSummaryJob(notebookId, snapshot);
          const progressText = snapshot.partialText?.trim()
            ? snapshot.partialText
            : buildSummaryProgressText(snapshot);
          updateMessage(notebookId, job.messageId, (msg) => ({
            ...msg,
            content: progressText,
          }));

          if (status.status === "done" && status.result) {
            updateMessage(notebookId, job.messageId, (msg) => ({
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
            useConversationStore.getState().setSummaryJob(notebookId, null);
            this.stopSummaryPoller(pollKey);
            break;
          }

          if (status.status === "canceled") {
            updateMessage(notebookId, job.messageId, (msg) => ({
              ...msg,
              content: "要約はキャンセルされました。",
            }));
            useConversationStore.getState().setSummaryJob(notebookId, null);
            this.stopSummaryPoller(pollKey);
            break;
          }

          if (status.status === "error") {
            const err =
              snapshot.error || sanitizeSummaryError(status.error);
            throw new Error(err);
          }
        } catch (error) {
          if (!active) return;
          console.error(error);
          const message =
            error instanceof Error && error.message
              ? error.message
              : "要約の進捗取得に失敗しました。";
          const poller = this.summaryPollers.get(pollKey);
          if (!poller) break;
          poller.retries += 1;
          if (poller.retries <= MAX_SUMMARY_STATUS_RETRIES) {
            updateMessage(notebookId, job.messageId, (msg) => ({
              ...msg,
              content: "要約の進捗確認に失敗しました。バックグラウンドで再試行します…",
            }));
            await delay(1000 * poller.retries + 500);
            continue;
          }
          updateMessage(notebookId, job.messageId, (msg) => ({
            ...msg,
            content: "要約をバックグラウンドで継続しています。しばらく後に再度開いてください。",
          }));
          this.stopSummaryPoller(pollKey);
          break;
        }

        await delay(1500);
      }
    };

    void loop();
  }

  private stopSummaryPoller(jobId: string) {
    const entry = this.summaryPollers.get(jobId);
    if (entry) {
      entry.stop();
      this.summaryPollers.delete(jobId);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateMessage(
  notebookId: string,
  messageId: string,
  updater: (message: NotebookMessage) => NotebookMessage,
) {
  useConversationStore.getState().updateMessages(notebookId, (messages) =>
    messages.map((msg) => (msg.id === messageId ? updater(msg) : msg)),
  );
}

function removeMessages(
  notebookId: string,
  predicate: (message: NotebookMessage) => boolean,
) {
  useConversationStore.getState().updateMessages(notebookId, (messages) =>
    messages.filter((msg) => !predicate(msg)),
  );
}

function buildSummaryProgressText(job: SummaryJobSnapshot): string {
  const phase = job.phase ?? "queue";
  const progress = job.progress ?? 0;
  if (phase === "retrieval") {
    return "資料を検索しています…";
  }
  if (phase === "map" || phase === "reduce") {
    return `要約を構築しています… (${Math.round(progress * 100)}%)`;
  }
  if (phase === "done") {
    return "最終調整を行っています…";
  }
  if (phase === "error") {
    return job.error ? `要約に失敗しました: ${job.error}` : "要約に失敗しました。";
  }
  return "要約を準備しています…";
}

const MAX_SUMMARY_STATUS_RETRIES = 4;

function normalizeSummarySnapshot(
  status: any,
  jobId: string,
  messageId: string,
  scope: Scope,
): SummaryJobSnapshot {
  const phaseValue = typeof status.phase === "string" ? status.phase : undefined;
  return {
    id: jobId,
    messageId,
    status: typeof status.status === "string" ? status.status : undefined,
    phase: phaseValue as SummaryJobSnapshot["phase"],
    progress:
      typeof status.progress === "number" && !Number.isNaN(status.progress)
        ? status.progress
        : undefined,
    metrics:
      status.metrics && typeof status.metrics === "object"
        ? status.metrics
        : undefined,
    partialText:
      typeof status.partial_text === "string" ? status.partial_text : undefined,
    hint: typeof status.hint === "string" ? status.hint : undefined,
    error: sanitizeSummaryError(status.error),
    startedAt:
      typeof status.started_at === "number" && !Number.isNaN(status.started_at)
        ? status.started_at
        : undefined,
    updatedAt:
      typeof status.updated_at === "number" && !Number.isNaN(status.updated_at)
        ? status.updated_at
        : Date.now(),
    scope,
  };
}

function sanitizeSummaryError(error: unknown): string | undefined {
  if (typeof error === "string") {
    return error;
  }
  if (!error || typeof error !== "object") {
    return undefined;
  }
  if ("message" in error && typeof error.message === "string") {
    return error.message;
  }
  return undefined;
}

export const notebookRunner = new NotebookRunner();
