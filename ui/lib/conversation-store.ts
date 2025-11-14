import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { SummaryJobSnapshot } from "./summary-job";

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: any[];
  segments?: Array<{ text: string; citationIndices: number[] }>;
  createdAt: number;
};

export type StoredSummaryJob = SummaryJobSnapshot;

type NotebookConversation = {
  messages: StoredMessage[];
  summaryJob?: StoredSummaryJob | null;
};

type ConversationStore = {
  notebooks: Record<string, NotebookConversation>;
  setMessages: (notebookId: string, messages: StoredMessage[]) => void;
  setSummaryJob: (notebookId: string, job: StoredSummaryJob | null) => void;
  clearNotebook: (notebookId: string) => void;
};

export const useConversationStore = create(
  persist<ConversationStore>(
    (set) => ({
      notebooks: {},
      setMessages: (notebookId, messages) =>
        set((state) => ({
          notebooks: {
            ...state.notebooks,
            [notebookId]: {
              ...(state.notebooks[notebookId] ?? { messages: [] }),
              messages,
            },
          },
        })),
      setSummaryJob: (notebookId, job) =>
        set((state) => ({
          notebooks: {
            ...state.notebooks,
            [notebookId]: {
              ...(state.notebooks[notebookId] ?? { messages: [] }),
              summaryJob: job ?? null,
            },
          },
        })),
      clearNotebook: (notebookId) =>
        set((state) => {
          const next = { ...state.notebooks };
          delete next[notebookId];
          return { notebooks: next };
        }),
    }),
    {
      name: "conversation-store",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? undefined : localStorage,
      ),
      version: 1,
    },
  ),
);
