"use client";

import type { DragEvent } from "react";

import type { Scope } from "./LibraryLayout";

type Props = {
  onFiles: (files: File[]) => void;
  scope: Scope;
  currentFolder: string;
};

export function UploadDropzone({ onFiles, scope, currentFolder }: Props) {
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 0) {
      onFiles(files);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="rounded-lg border-2 border-dashed border-sea-200 bg-gradient-to-br from-sea-50 via-white to-white px-6 py-8 text-center text-[14px] text-sumi-700 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md hover:bg-sea-100/60"
    >
      <div className="mb-3 text-4xl text-sea-600" aria-hidden="true">⬆️</div>
      <div className="mb-1 text-[15px] font-semibold text-sumi-900">ファイルをドラッグ＆ドロップ</div>
      <div className="mb-3 text-[13px] text-sumi-600">または 上部の「アップロード」ボタンでファイルを選択</div>
      <div className="text-[12px] text-sumi-500">
        保存先: <span className="font-medium text-sumi-800">{scopeLabel(scope)}</span> /{" "}
        <span className="font-medium text-sumi-800">{folderLabel(currentFolder)}</span>
      </div>
    </div>
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
