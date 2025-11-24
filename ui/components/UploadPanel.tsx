"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { toast } from "sonner";

import type { Scope } from "@/lib/api";

export type LibraryUploadRecord = {
  id: string;
  folder_path?: string;
  original_name?: string;
  mime_type?: string;
  notebook_id?: string;
  scope?: string;
  size_bytes?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type UploadPanelProps = {
  scope: Scope;
  notebookId: string;
  nextcloudPath?: string;
  onBusyChange?: (busy: boolean) => void;
  onCompleted?: () => void;
  onDocumentReady?: (doc: any) => void;
  onFileUploaded?: (file: LibraryUploadRecord) => void;
  inputId?: string;
};

type UploadStatus = "pending" | "uploading" | "processing" | "done" | "error";

type UploadItem = {
  id: string;
  name: string;
  size: number;
  status: UploadStatus;
  percent: number;
  error?: string;
};

export function UploadPanel({
  scope,
  notebookId,
  nextcloudPath,
  onBusyChange,
  onCompleted,
  onDocumentReady,
  onFileUploaded,
  inputId = "local-upload-input",
}: UploadPanelProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const busy = useMemo(
    () => items.some((item) => item.status === "uploading" || item.status === "processing"),
    [items],
  );

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    if (!isMountedRef.current) return;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const startUpload = useCallback(
    (file: File) => {
      if (typeof window === "undefined") return;
      const id = `${Date.now()}-${file.name}`;
      if (isMountedRef.current) {
        setItems((prev) => [
          ...prev,
          {
            id,
            name: file.name,
            size: file.size,
            status: "uploading",
            percent: 0,
          },
        ]);
      }

      const includeGlobal = scope.include_global ? "true" : "false";
      const uploadUrl = new URL("/api/backend/files/upload", window.location.origin);
      uploadUrl.searchParams.set("tenant", scope.tenant);
      uploadUrl.searchParams.set("user_id", scope.user_id);
      uploadUrl.searchParams.set("notebook_id", scope.notebook_id);
      uploadUrl.searchParams.set("include_global", includeGlobal);

      const form = new FormData();
      form.append("file", file, file.name);
      form.append("notebookId", notebookId);
      if (nextcloudPath) {
        form.append("folderPath", nextcloudPath);
      }
      form.append("storageScope", scope.include_global ? "org" : "personal");

      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadUrl.toString());
      xhr.responseType = "json";
      xhr.setRequestHeader("x-tenant", scope.tenant);
      xhr.setRequestHeader("x-user-id", scope.user_id);
      xhr.setRequestHeader("x-notebook-id", scope.notebook_id);
      xhr.setRequestHeader("x-include-global", includeGlobal);

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.min(99, Math.floor((event.loaded / event.total) * 100));
        updateItem(id, { percent });
      };

      xhr.onerror = () => {
        updateItem(id, { status: "error", error: "ネットワークエラー" });
        if (isMountedRef.current) {
          toast.error("アップロードに失敗しました");
        }
      };

      xhr.onload = () => {
        const ok = xhr.status >= 200 && xhr.status < 300;
        if (!ok) {
          updateItem(id, { status: "error", error: `HTTP ${xhr.status}` });
          if (isMountedRef.current) {
            toast.error("アップロードに失敗しました");
          }
          return;
        }
        updateItem(id, { status: "processing", percent: 100 });
        const payload = xhr.response;
        if (payload?.file) {
          const record = payload.file as LibraryUploadRecord;
          if (record?.id) {
            onFileUploaded?.(record);
          }
          onDocumentReady?.({
            title: record?.original_name || file.name,
            metadata: {
              file_name: record?.original_name || file.name,
              file_id: record?.id,
            },
          });
        }
        onCompleted?.();
        if (isMountedRef.current) {
          toast.success(`${file.name} を取り込みました`);
        }
        setTimeout(() => {
          updateItem(id, { status: "done" });
        }, 800);
      };

      xhr.send(form);
    },
    [scope, notebookId, nextcloudPath, onCompleted, onDocumentReady, onFileUploaded, updateItem],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (!event.dataTransfer?.files?.length) return;
      Array.from(event.dataTransfer.files).forEach((file) => startUpload(file));
    },
    [startUpload],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files?.length) return;
      Array.from(event.target.files).forEach((file) => startUpload(file));
      event.target.value = "";
    },
    [startUpload],
  );

  return (
    <div
      className={`rounded-2xl border border-dashed p-5 text-center ${
        isDragging ? "border-sky-400 bg-sky-50" : "border-slate-300 bg-slate-50"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input id={inputId} type="file" multiple className="hidden" onChange={handleInputChange} disabled={false} />
      <label
        htmlFor={inputId}
        className={`inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 ${
          "cursor-pointer"
        }`}
      >
        ファイルを選択
      </label>
      <p className="mt-2 text-xs text-slate-500">
        ここにドラッグ & ドロップしてローカル資料を追加できます。
        {nextcloudPath ? ` このNotebookでは ${nextcloudPath} に分類されます。` : ""}
      </p>
      {items.length > 0 ? (
        <ul className="mt-4 space-y-2 text-left">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-white/10 bg-white/80 p-3 shadow-sm">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-900">{item.name}</span>
                <span className="text-xs text-slate-500">{formatBytes(item.size)}</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${item.status === "error" ? "bg-rose-500" : "bg-sky-500"}`}
                  style={{ width: `${item.status === "done" ? 100 : item.percent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {item.status === "uploading" && "アップロード中"}
                {item.status === "processing" && "Nextcloud に反映中"}
                {item.status === "done" && "完了"}
                {item.status === "error" && (item.error || "失敗しました")}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
