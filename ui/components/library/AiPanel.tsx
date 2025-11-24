"use client";

import { useState } from "react";

import type { Scope } from "./LibraryLayout";

type Props = {
  scope: Scope;
  currentFolder: string;
};

type Message = { role: "user" | "assistant"; text: string };

export function AiPanel({ scope, currentFolder }: Props) {
  const [mode, setMode] = useState<"chat" | "summary">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);

  const handleSuggestClick = (prompt: string) => {
    if (pending) return;
    sendPrompt(prompt);
  };

  const sendPrompt = async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setPending(true);
    try {
      const response = await fetch("/api/backend/ai/library-helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          scope,
          folder: currentFolder || "/",
          mode,
        }),
      });
      if (!response.ok) {
        throw new Error("AIの呼び出しに失敗しました");
      }
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      const reply = payload?.message || "AIからの応答を取得できませんでした。";
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AIの呼び出しに失敗しました";
      setMessages((prev) => [...prev, { role: "assistant", text: message }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col rounded-lg">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-sumi-200 px-5 py-5">
          <div className="text-[13px] font-semibold text-sumi-700">AIファイル秘書</div>
          <div className="mt-1 text-[12px] leading-relaxed text-sumi-500">
            資料の検索・要約・整理をお手伝いします。
            <br />
            閲覧範囲: <span className="text-sumi-800">{scopeLabel(scope)}</span>
            <br />
            フォルダ: <span className="text-sumi-800">{folderLabel(currentFolder)}</span>
          </div>
          <div className="mt-3 inline-flex rounded-full border border-sumi-300 bg-sumi-50 p-1 text-[12px] font-medium text-sumi-700">
            <button
              type="button"
              onClick={() => setMode("chat")}
              className={`rounded-full px-3 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600 ${mode === "chat" ? "bg-white text-sea-800 shadow-sm" : ""
                }`}
              aria-pressed={mode === "chat"}
            >
              チャット
            </button>
            <button
              type="button"
              onClick={() => setMode("summary")}
              className={`rounded-full px-3 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600 ${mode === "summary" ? "bg-white text-sea-800 shadow-sm" : ""
                }`}
              aria-pressed={mode === "summary"}
            >
              要約
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <AiChip label="種類ごとに整理" onClick={() => handleSuggestClick("このフォルダの資料を種類ごとに整理して")} />
            <AiChip label="重複候補を出す" onClick={() => handleSuggestClick("重複していそうな資料候補を教えて")} />
            <AiChip label="最近1週間の更新" onClick={() => handleSuggestClick("最近1週間で更新された資料だけ一覧に表示して")} />
          </div>

          <p className="mt-3 text-[12px] text-sumi-500">
            AIに整理や検索を依頼すると、ここに結果が表示されます。必要に応じて中央の一覧へ反映されます。
          </p>
        </div>

        <div className="flex-1 space-y-2 overflow-auto bg-sumi-50 px-5 py-4 text-[13px]">
          {messages.length === 0 && (
            <div className="mt-6 text-center text-[13px] text-sumi-500 leading-relaxed">
              スコープやフォルダに基づいて、AIが整理や検索の提案を行います。
              <br />
              上のチップから質問例を選んでみてください。
            </div>
          )}
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-md px-3 py-2 ${message.role === "user"
                  ? "bg-white text-sumi-900 shadow-sm"
                  : "border border-sumi-200 bg-white text-sumi-700"
                }`}
            >
              {message.text}
            </div>
          ))}
          {pending && <div className="px-3 py-2 text-[12px] text-sumi-500">考えています…</div>}
        </div>

        <form
          className="border-t border-sumi-200 px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            const form = event.currentTarget;
            const input = form.elements.namedItem("q") as HTMLInputElement | null;
            if (!input) return;
            const value = input.value.trim();
            if (!value) return;
            sendPrompt(value);
            input.value = "";
          }}
        >
          <label className="block text-[12px] font-medium text-sumi-700">
            AIに依頼する内容
            <span className="sr-only">AI入力欄</span>
            <input
              name="q"
              placeholder="例: 最新の決算資料を要約して"
              className="mt-2 w-full rounded-full border border-sumi-300 px-4 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-sea-600"
            />
          </label>
        </form>
      </div>
    </div>
  );
}

function AiChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-full bg-sumi-100 px-3 py-1 text-[12px] text-sumi-700 transition hover:bg-sumi-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600"
    >
      {label}
    </button>
  );
}

function scopeLabel(scope: Scope) {
  switch (scope) {
    case "personal":
      return "個人";
    case "team":
      return "チーム";
    case "org":
      return "部署";
    case "company":
      return "会社";
    default:
      return scope;
  }
}

function folderLabel(path: string) {
  if (!path || path === "/") return "ルート";
  return path.replace(/^\/+/, "").split("/").join(" / ");
}
