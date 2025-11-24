import type { ChangeEvent } from "react";

import { FolderPlus, Search, Upload } from "lucide-react";

import type { Scope } from "./LibraryLayout";

type Props = {
  scope: Scope;
  onScopeChange: (next: Scope) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

const SCOPE_OPTIONS: Array<{ label: string; value: Scope }> = [
  { label: "個人", value: "personal" },
  { label: "チーム", value: "team" },
  { label: "部署", value: "org" },
  { label: "会社", value: "company" },
];

export function LibraryHeader({ scope, onScopeChange, searchQuery, onSearchChange }: Props) {
  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);
    document.dispatchEvent(new CustomEvent<File[]>("library:uploadFiles", { detail: selectedFiles }));
    event.target.value = "";
  };

  return (
    <header className="rounded-xl border border-sea-100 bg-gradient-to-r from-sea-50 via-white to-white px-5 py-5 shadow-md shadow-sumi-200/50">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-sumi-900">資料ライブラリ</h1>
          <p className="mt-1 text-[14px] leading-[1.6] text-sumi-600">
            社内資料をアップロードして、安全に保管・整理します。
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-sumi-200 bg-white px-4 py-2 text-[14px] font-medium text-sumi-800 shadow-sm transition hover:-translate-y-[1px] hover:bg-sumi-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600"
          >
            <FolderPlus className="h-4 w-4 text-sumi-500" aria-hidden="true" />
            フォルダ作成
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-gradient-to-r from-sea-600 to-sea-700 px-4 py-2 text-[14px] font-semibold text-white shadow-[0_6px_16px_rgba(38,74,244,0.25)] transition hover:-translate-y-[1px] hover:shadow-[0_10px_24px_rgba(38,74,244,0.25)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sea-600">
            <Upload className="h-4 w-4" aria-hidden="true" />
            アップロード
            <input type="file" multiple className="hidden" onChange={handleUploadChange} />
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end">
        <div className="space-y-1">
          <div className="text-[12px] font-medium text-sumi-700">閲覧範囲</div>
          <div className="inline-flex flex-wrap gap-1 rounded-full bg-sumi-100 p-1" role="group" aria-label="閲覧範囲">
            {SCOPE_OPTIONS.map((option) => {
              const isActive = scope === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onScopeChange(option.value)}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600 ${isActive
                      ? "border border-sea-500 bg-white text-sea-800 shadow-sm"
                      : "text-sumi-600 hover:text-sumi-800"
                    }`}
                  aria-pressed={isActive}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1">
          <label className="block text-[12px] font-medium text-sumi-700">
            資料検索
            <span className="mt-0.5 block text-[12px] font-normal text-sumi-500">資料名・フォルダ名などを入力</span>
            <div className="mt-2 flex items-center rounded-full border border-sumi-300 bg-white px-4 py-2 focus-within:border-sea-600 focus-within:ring-2 focus-within:ring-sea-600">
              <Search className="mr-3 h-4 w-4 text-sumi-500" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="例: 経営会議 / IR資料"
                className="flex-1 text-[14px] text-sumi-900 placeholder:text-sumi-400 focus:outline-none"
              />
            </div>
          </label>
        </div>
      </div>
    </header>
  );
}
