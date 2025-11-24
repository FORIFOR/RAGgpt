"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type PersistStorage } from "zustand/middleware";
import { useEffect, useState } from "react";

import type { SummaryJobSnapshot } from "./summary-job";
import type { NotebookMessage } from "@/types/notebook-conversation";

type NotebookConversation = {
  messages: NotebookMessage[];
  summaryJob?: SummaryJobSnapshot | null;
};

export const EMPTY_NOTEBOOK_CONVERSATION: NotebookConversation = {
  messages: [],
  summaryJob: null,
};

type ConversationStore = {
  notebooks: Record<string, NotebookConversation>;
  setMessages: (notebookId: string, messages: NotebookMessage[]) => void;
  updateMessages: (
    notebookId: string,
    updater: (messages: NotebookMessage[]) => NotebookMessage[],
  ) => void;
  setSummaryJob: (notebookId: string, job: SummaryJobSnapshot | null) => void;
  clearNotebook: (notebookId: string) => void;
};

const storage: PersistStorage<ConversationStore> | undefined =
  typeof window === "undefined"
    ? undefined
    : createJSONStorage<ConversationStore>(() => localStorage);

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
      updateMessages: (notebookId, updater) =>
        set((state) => {
          const current = state.notebooks[notebookId]?.messages ?? [];
          return {
            notebooks: {
              ...state.notebooks,
              [notebookId]: {
                ...(state.notebooks[notebookId] ?? { messages: [] }),
                messages: updater(current),
              },
            },
          };
        }),
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
      storage,
      version: 1,
      skipHydration: true,
    },
  ),
);

export function useConversationStoreHydration(): boolean {
  const [hydrated, setHydrated] = useState(
    () => useConversationStore.persist.hasHydrated?.() ?? false,
  );

  useEffect(() => {
    const unsubHydrate = useConversationStore.persist.onHydrate?.(() => {
      setHydrated(false);
    });
    const unsubFinish = useConversationStore.persist.onFinishHydration?.(() => {
      setHydrated(true);
    });
    if (!useConversationStore.persist.hasHydrated?.()) {
      void useConversationStore.persist.rehydrate();
    }
    return () => {
      unsubHydrate?.();
      unsubFinish?.();
    };
  }, []);

  return hydrated;
}
