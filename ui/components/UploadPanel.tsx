"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ChangeEvent, DragEvent } from "react";
import { toast } from "sonner";

import type { Scope } from "@/lib/api";

type UploadStatus = "uploading" | "done" | "error";

type UploadItem = {
  id: string;
  name: string;
  percent: number;
  status: UploadStatus;
};

type UploadPanelProps = {
  scope: Scope;
  onBusyChange?: (busy: boolean) => void;
  onCompleted?: () => void;
  onDocumentReady?: (doc: any) => void;
};

export function UploadPanel({
  scope,
  onBusyChange,
  onCompleted,
  onDocumentReady,
}: UploadPanelProps) {
  const [items, setItems] = useState<UploadItem[]>([]);

  const busy = useMemo(
    () => items.some((item) => item.status === "uploading"),
    [items],
  );

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const startUpload = useCallback(
    (file: File) => {
      const id = `${Date.now()}-${file.name}`;
      setItems((prev) => [
        ...prev,
        { id, name: file.name, percent: 0, status: "uploading" },
      ]);

      const includeGlobal = scope.include_global ? "true" : "false";
      const ingestUrl = new URL("/api/backend/ingest", window.location.origin);
      ingestUrl.searchParams.set("tenant", scope.tenant);
      ingestUrl.searchParams.set("user_id", scope.user_id);
      ingestUrl.searchParams.set("notebook_id", scope.notebook_id);
      ingestUrl.searchParams.set("include_global", includeGlobal);

      const form = new FormData();
      form.append("files", file, file.name);
      form.append("tenant", scope.tenant);
      form.append("user_id", scope.user_id);
      form.append("notebook_id", scope.notebook_id);
      form.append("include_global", includeGlobal);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", ingestUrl.toString());
      xhr.responseType = "text";
      xhr.setRequestHeader("x-tenant", scope.tenant);
      xhr.setRequestHeader("x-user-id", scope.user_id);
      xhr.setRequestHeader("x-notebook-id", scope.notebook_id);
      xhr.setRequestHeader("x-include-global", includeGlobal);

      let chunkBuffer = "";
      let lastIndex = 0;
      let completionState: "pending" | "success" | "error" = "pending";

      const finishSuccess = () => {
        updateItem(id, { status: "done", percent: 100 });
        if (completionState === "pending") {
          completionState = "success";
          onCompleted?.();
          toast.success("取り込みが完了しました");
        }
      };

      const finishError = (message: string) => {
        updateItem(id, { status: "error" });
        if (completionState !== "error") {
          completionState = "error";
          toast.error(message);
        }
      };

      const handleServerChunk = (chunk: string) => {
        chunkBuffer += chunk;
        const segments = chunkBuffer.split("\n\n");
        chunkBuffer = segments.pop() ?? "";

        segments.forEach((segment) => {
          const lines = segment
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          if (lines.length === 0) return;

          const eventLine = lines.find((line) => line.startsWith("event:"));
          const dataLine = lines.find((line) => line.startsWith("data:"));
          const eventName = eventLine ? eventLine.slice(6).trim() : "status";
          if (!dataLine) return;

          const payloadRaw = dataLine.slice(5).trim();
          if (!payloadRaw) return;

          let payload: any;
          try {
            payload = JSON.parse(payloadRaw);
          } catch {
            return;
          }

          if (eventName === "status" && typeof payload.progress === "number") {
            const percent = Math.max(
              0,
              Math.min(100, Math.round(payload.progress)),
            );
            updateItem(id, { percent });
          } else if (eventName === "done") {
            if (Array.isArray(payload?.documents)) {
              payload.documents.forEach((doc: any) => onDocumentReady?.(doc));
            }
            finishSuccess();
          } else if (eventName === "error") {
            const message = String(
              payload?.error || payload?.message || "取り込みに失敗しました",
            );
            finishError(message);
          }
        });
      };

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.min(
          99,
          Math.floor((event.loaded / event.total) * 100),
        );
        updateItem(id, { percent });
      };

      xhr.onreadystatechange = () => {
        if (
          xhr.readyState === XMLHttpRequest.LOADING ||
          xhr.readyState === XMLHttpRequest.DONE
        ) {
          const text = xhr.responseText || "";
          if (text.length > lastIndex) {
            const delta = text.slice(lastIndex);
            lastIndex = text.length;
            handleServerChunk(delta);
          }
        }
      };

      xhr.onerror = () => {
        finishError("アップロード中にエラーが発生しました");
      };

      xhr.onload = () => {
        const ok = xhr.status >= 200 && xhr.status < 300;
        if (ok) {
          finishSuccess();
        } else {
          finishError(`取り込みに失敗しました (HTTP ${xhr.status})`);
        }
      };

      xhr.send(form);
    },
    [scope, updateItem, onCompleted, onDocumentReady],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      Array.from(files).forEach((file) => startUpload(file));
      event.target.value = "";
    },
    [startUpload],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const files = event.dataTransfer?.files;
      if (!files?.length) return;
      Array.from(files).forEach((file) => startUpload(file));
    },
    [startUpload],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  return (
    <div
      className="space-y-3"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <label className="btn-focus inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-sky-300">
          <input
            type="file"
            className="hidden"
            multiple
            onChange={handleInputChange}
          />
          ファイルを選択
        </label>
        <p className="mt-2 text-xs text-slate-500">
          複数ファイルのドラッグ＆ドロップにも対応しています。
        </p>

        {items.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="list-focus rounded-lg border border-slate-200 bg-white p-2"
                data-selected={item.status === "uploading" ? "true" : undefined}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-slate-800">
                    {item.name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {item.status === "done"
                      ? "完了"
                      : item.status === "error"
                      ? "失敗"
                      : `${item.percent}%`}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-100">
                  <div
                    className={`h-full rounded ${
                      item.status === "error" ? "bg-rose-400" : "bg-sky-500"
                    }`}
                    style={{
                      width: `${
                        item.status === "done" ? 100 : item.percent
                      }%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
