"use client";

import { useMemo, useState, useRef, type ChangeEvent } from "react";
import {
  Search,
  FolderPlus,
  Upload,
  ChevronDown,
  X,
  FileText,
  MoreHorizontal,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { LibraryScope } from "./library-types";

export type LibraryTagCategory = "docType" | "topic" | "entity" | "state" | "extra";

export type LibraryTag = {
  id: string;
  label: string;
  category: LibraryTagCategory;
};

export type LibraryFile = {
  id: string;
  name: string;
  originalName?: string;
  type: string;
  size: string;
  folder: string;
  date: string;
  owner: string;
  dateFolder: string;
  tags: LibraryTag[];
  summary?: string;
};

export type DateFilter = {
  year?: string;
  month?: string;
  day?: string;
};

export type DateTreeMonth = {
  label: string;
  value: string;
  count: number;
  days: Array<{ label: string; value: string; count: number }>;
};

export type DateTreeYear = {
  label: string;
  value: string;
  count: number;
  months: DateTreeMonth[];
};

type HeaderProps = {
  scope: LibraryScope;
  onScopeChange: (s: LibraryScope) => void;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  onUploadFiles?: (files: File[]) => void;
};

export function HeaderBar({
  scope,
  onScopeChange,
  searchQuery,
  onSearchChange,
  onUploadFiles,
}: HeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      onUploadFiles?.(files)
    }
  };

  return (
    <header className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-sumi-900 tracking-tight">資料ライブラリ</h1>
          <p className="mt-1 text-[13px] text-sumi-600">社内資料をアップロードして、安全に保管・整理します。</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <SearchBox value={searchQuery} onChange={onSearchChange} />
          </div>
          <button className="inline-flex items-center gap-1.5 text-[13px] font-medium border border-gray-300 bg-white rounded-md px-3 py-2 hover:bg-gray-50 transition-colors text-gray-700">
            <FolderPlus className="w-4 h-4" />
            <span>フォルダ作成</span>
          </button>
          <button
            onClick={handleUploadClick}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4" />
            <span>アップロード</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={handleFileChange}
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-gray-200 pb-1">
        <ScopeTabs scope={scope} onScopeChange={onScopeChange} />
        <div className="md:hidden">
          <SearchBox value={searchQuery} onChange={onSearchChange} />
        </div>
      </div>
    </header>
  );
}

function ScopeTabs({ scope, onScopeChange }: { scope: LibraryScope; onScopeChange: (s: LibraryScope) => void }) {
  const items: { label: string; value: LibraryScope }[] = [
    { label: "個人", value: "personal" },
    { label: "チーム", value: "team" },
    { label: "部署", value: "org" },
    { label: "会社", value: "company" },
  ];
  return (
    <div className="flex items-center gap-6">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onScopeChange(item.value)}
          className={`relative pb-3 text-[14px] font-medium transition-colors ${scope === item.value ? "text-blue-700" : "text-gray-500 hover:text-gray-800"
            }`}
        >
          {item.label}
          {scope === item.value && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />
          )}
        </button>
      ))}
    </div>
  );
}



function SearchBox({ value, onChange }: { value?: string; onChange?: (value: string) => void }) {
  return (
    <div className="group flex items-center rounded-md border border-sumi-300 bg-white px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-sea-600 focus-within:border-transparent hover:border-sumi-400 w-[300px]">
      <Search className="mr-2 w-4 h-4 text-sumi-400" />
      <input
        type="search"
        className="flex-1 text-[13px] text-sumi-900 outline-none placeholder:text-sumi-400"
        placeholder="資料名・タグ・日付で検索..."
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
      />
      <button className="ml-1 rounded p-1 text-sumi-400 hover:bg-sumi-100 hover:text-sumi-600">
        <ChevronDown className="w-3 h-3" />
      </button>
    </div>
  );
}

export type SmartView = "all" | "needs_curation" | "duplicates" | "stale_drafts";

const viewFilterLabels: Record<SmartView, string> = {
  all: "すべて",
  needs_curation: "要整理の資料",
  duplicates: "重複候補",
  stale_drafts: "古いドラフト",
};

export function Sidebar({
  viewFilter,
  onViewChange,
  dateTree,
  activeDate,
  onSelectDate,
}: {
  viewFilter: SmartView;
  onViewChange: (view: SmartView) => void;
  dateTree: DateTreeYear[];
  activeDate: DateFilter;
  onSelectDate: (filter: DateFilter) => void;
}) {
  const viewItems: Array<{ key: SmartView; label: string; icon: string }> = [
    { key: "all", label: "すべて", icon: "👤" },
    { key: "needs_curation", label: "要整理の資料", icon: "🧹" },
    { key: "duplicates", label: "重複候補", icon: "📑" },
    { key: "stale_drafts", label: "古いドラフト", icon: "⏳" },
  ];

  return (
    <div className="h-full flex flex-col text-[14px]">
      <div className="px-4 pt-4 pb-2">
        <div className="text-[11px] font-semibold text-sumi-500 flex items-center gap-1 mb-1">
          <span>👁</span>ビュー
        </div>
        <nav className="space-y-1">
          {viewItems.map((item) => (
            <SidebarItem
              key={item.key}
              icon={item.icon}
              label={item.label}
              active={viewFilter === item.key}
              onClick={() => onViewChange(item.key)}
            />
          ))}
        </nav>
      </div>

      <div className="mt-3 border-t border-sumi-200 pt-4 px-4 flex-1">
        <div className="text-[11px] font-semibold text-sumi-500 flex items-center gap-1 mb-1">
          <span>📁</span>フォルダ
        </div>

        <nav className="space-y-0.5">
          <button
            type="button"
            className={`w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors relative ${!activeDate.year ? "bg-sea-50 text-sea-700 font-medium" : "text-sumi-700 hover:bg-sumi-100"
              }`}
            onClick={() => onSelectDate({})}
          >
            {!activeDate.year && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-sea-600" />}
            すべての日付
          </button>
          {dateTree.map((year) => (
            <SidebarFolder
              key={year.value}
              label={`${year.label}`}
              count={year.count}
              active={activeDate.year === year.value && !activeDate.month}
              onClick={() => onSelectDate({ year: year.value })}
            >
              {year.months.map((month) => (
                <SidebarFolder
                  key={`${year.value}-${month.value}`}
                  label={`${month.label}`}
                  count={month.count}
                  level={1}
                  active={activeDate.year === year.value && activeDate.month === month.value && !activeDate.day}
                  onClick={() => onSelectDate({ year: year.value, month: month.value })}
                >
                  {month.days.map((day) => (
                    <SidebarFolder
                      key={`${year.value}-${month.value}-${day.value}`}
                      label={`${day.label}`}
                      count={day.count}
                      level={2}
                      active={
                        activeDate.year === year.value &&
                        activeDate.month === month.value &&
                        activeDate.day === day.value
                      }
                      onClick={() => onSelectDate({ year: year.value, month: month.value, day: day.value })}
                    />
                  ))}
                </SidebarFolder>
              ))}
            </SidebarFolder>
          ))}
        </nav>
      </div>
    </div>
  );
}

function SidebarItem({ label, icon, active, onClick }: { label: string; icon?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors relative ${active ? "bg-sea-50 text-sea-700 font-medium" : "text-sumi-700 hover:bg-sumi-100"}`}
      onClick={onClick}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-sea-600" />}
      {icon && <span className="text-[16px]">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

function SidebarFolder({
  label,
  count,
  level = 0,
  active,
  onClick,
  children,
}: {
  label: string;
  count: number;
  level?: number;
  active?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = !!children;
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors relative ${active ? "bg-sea-50 text-sea-700 font-medium" : "text-sumi-700 hover:bg-sumi-100"}`}
        style={{ paddingLeft: 8 + level * 16 }}
        onClick={() => {
          onClick?.();
          if (hasChildren) setOpen((o) => !o);
        }}
      >
        {hasChildren ? <span className="text-[12px]">{open ? "▾" : "▸"}</span> : <span className="text-[16px]">📄</span>}
        {!hasChildren && level === 0 && <span className="text-[16px]">📁</span>}
        <span>{label}</span>
        <span className="ml-auto inline-flex items-center justify-center min-w-[22px] rounded-full bg-sumi-100 text-[11px] text-sumi-600 px-1.5">{count}</span>
        {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-sea-600" />}
      </button>
      {open && hasChildren && <div className="ml-4 border-l border-sumi-200 pl-2 space-y-0.5">{children}</div>}
    </div>
  );
}

type DropProps = {
  scope: LibraryScope;
  onUploadFiles?: (files: File[]) => void;
};

export function UploadDialog({
  open,
  onOpenChange,
  scope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: LibraryScope;
}) {
  const scopeLabel = scope === "personal" ? "個人" : scope === "team" ? "チーム" : scope === "org" ? "部署" : "会社";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>ファイルをアップロード</DialogTitle>
          <DialogDescription>
            {scopeLabel}ライブラリにファイルを追加します。
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="border-2 border-dashed border-sea-200 bg-sea-50/30 rounded-lg px-10 py-12 text-center w-full transition-colors hover:bg-sea-50/50 hover:border-sea-300 cursor-pointer group">
            <div className="text-4xl text-sea-400 mb-3 group-hover:scale-110 transition-transform duration-200">⬆️</div>
            <p className="text-[15px] font-bold text-sumi-900">ファイルをドラッグ＆ドロップ</p>
            <p className="mt-2 text-[13px] text-sumi-600">または クリックしてファイルを選択</p>
            <p className="mt-4 text-[11px] text-sumi-500 bg-white inline-block px-3 py-1 rounded-full border border-sumi-200">
              対応形式: PDF, Word, Excel, PowerPoint (最大 50MB)
            </p>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-md border border-sumi-300 text-sumi-700 hover:bg-sumi-50 transition-colors"
          >
            キャンセル
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Dropzone({ scope, onUploadFiles }: DropProps) {
  const scopeLabel = scope === "personal" ? "個人" : scope === "team" ? "チーム" : scope === "org" ? "部署" : "会社";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    onUploadFiles?.(files);
  };

  return (
    <div
      className="h-full flex items-center justify-center py-8"
      onClick={() => fileInputRef.current?.click()}
      onDrop={(e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
      }}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="border-2 border-dashed border-blue-200 bg-blue-50/30 rounded-lg px-10 py-8 text-center w-full max-w-[560px] transition-colors hover:bg-blue-50/50 hover:border-blue-300 cursor-pointer group">
        <div className="flex justify-center mb-2">
          <Upload className="w-10 h-10 text-blue-400 group-hover:scale-110 transition-transform duration-200" />
        </div>
        <p className="text-[14px] font-bold text-gray-900">ファイルをドラッグ＆ドロップ</p>
        <p className="mt-1 text-[13px] text-gray-600">または 上部の「アップロード」ボタンでファイルを選択</p>
        <p className="mt-2 text-[11px] text-gray-500">保存先: {scopeLabel} / ルート</p>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  );
}

export const mockFiles: LibraryFile[] = [
  {
    id: "file_1",
    name: "2024年度経営計画.pdf",
    originalName: "scan_0001.pdf",
    type: "PDF",
    size: "2.4 MB",
    folder: "プロジェクト資料",
    date: "2024-11-15",
    owner: "山田太郎",
    dateFolder: "2024/11/15",
    tags: [
      { id: "t1", label: "経営計画書", category: "docType" },
      { id: "t2", label: "中期経営計画", category: "topic" },
      { id: "t3", label: "社内プロジェクトX", category: "entity" },
      { id: "t4", label: "確定版", category: "state" },
      { id: "t5", label: "2024年度", category: "extra" },
    ] satisfies LibraryTag[],
    summary: "売上目標・重点投資領域・KPI をまとめた年度計画の確定版です。",
  },
  {
    id: "file_2",
    name: "製品仕様書_v3.docx",
    originalName: "document(3).docx",
    type: "Word",
    size: "1.8 MB",
    folder: "プロジェクト資料",
    date: "2024-11-14",
    owner: "佐藤花子",
    dateFolder: "2024/11/14",
    tags: [
      { id: "t6", label: "仕様書", category: "docType" },
      { id: "t7", label: "補助金申請", category: "topic" },
      { id: "t8", label: "A社", category: "entity" },
      { id: "t9", label: "ドラフト", category: "state" },
      { id: "t10", label: "第3四半期", category: "extra" },
    ] satisfies LibraryTag[],
    summary: "補助金申請で必要な仕様要件をまとめたドラフト版です。",
  },
  {
    id: "file_3",
    name: "11月経営会議議事録.pdf",
    type: "PDF",
    size: "512 KB",
    folder: "議事録",
    date: "2024-11-13",
    owner: "田中一郎",
    dateFolder: "2024/11/13",
    tags: [
      { id: "t11", label: "議事録", category: "docType" },
      { id: "t12", label: "経営会議", category: "topic" },
      { id: "t13", label: "none", category: "entity" },
      { id: "t14", label: "レビュー待ち", category: "state" },
    ] satisfies LibraryTag[],
    summary: "11月度経営会議の決定事項とフォローアップ項目をまとめています。",
  },
  {
    id: "file_4",
    name: "取引先A契約書.pdf",
    type: "PDF",
    size: "3.2 MB",
    folder: "契約書",
    date: "2024-11-12",
    owner: "鈴木次郎",
    dateFolder: "2024/11/12",
    tags: [
      { id: "t15", label: "契約書", category: "docType" },
      { id: "t16", label: "売買契約", category: "topic" },
      { id: "t17", label: "A社", category: "entity" },
      { id: "t18", label: "確定版", category: "state" },
      { id: "t19", label: "NDA", category: "extra" },
    ] satisfies LibraryTag[],
    summary: "A社との新規取引に関する正式な契約書です。",
  },
  {
    id: "file_5",
    name: "新人研修マニュアル.pptx",
    type: "PowerPoint",
    size: "5.1 MB",
    folder: "マニュアル",
    date: "2024-11-10",
    owner: "高橋美咲",
    dateFolder: "2024/11/10",
    tags: [
      { id: "t20", label: "マニュアル", category: "docType" },
      { id: "t21", label: "人事・採用", category: "topic" },
      { id: "t22", label: "全社", category: "entity" },
      { id: "t23", label: "最新", category: "state" },
    ] satisfies LibraryTag[],
    summary: "新入社員向けの研修カリキュラムと資料リンクをまとめています。",
  },
];

export function FileTable({
  files,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onTagFilterAdd,
  sortConfig,
  onSort,
}: {
  files: LibraryFile[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onTagFilterAdd?: (tag: LibraryTag) => void;
  sortConfig: { key: keyof LibraryFile; direction: 'asc' | 'desc' } | null;
  onSort: (key: keyof LibraryFile) => void;
}) {
  const allSelected = useMemo(() => files.length > 0 && selectedIds.length === files.length, [files.length, selectedIds.length]);
  return (
    <div className="px-4 py-3 text-[14px]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-sumi-50 border-b border-sumi-200 text-[11px] text-sumi-600 sticky top-0 z-10 shadow-sm">
            <th className="w-8 px-2 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) => onToggleSelectAll(event.target.checked)}
                aria-label="すべてのファイルを選択"
                className="w-4 h-4 rounded border-sumi-300 text-sea-600 focus:ring-2 focus:ring-sea-600 focus:ring-offset-0"
              />
            </th>
            <SortableHeader label="ファイル名" sortKey="name" sortConfig={sortConfig} onSort={onSort} />
            <th className="text-left px-2 py-2 font-medium">タグ</th>
            <SortableHeader label="種類" sortKey="type" sortConfig={sortConfig} onSort={onSort} />
            <SortableHeader label="サイズ" sortKey="size" align="right" sortConfig={sortConfig} onSort={onSort} />
            <SortableHeader label="フォルダ" sortKey="folder" sortConfig={sortConfig} onSort={onSort} />
            <SortableHeader label="アップロード日" sortKey="date" sortConfig={sortConfig} onSort={onSort} />
            <SortableHeader label="アップロード者" sortKey="owner" sortConfig={sortConfig} onSort={onSort} />
            <th className="w-8 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {files.map((f) => {
            const checked = selectedIds.includes(f.id);
            return (
              <tr key={f.id} className="border-b border-sumi-200 hover:bg-sumi-50">
                <td className="px-2 py-2.5 align-top">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleSelect(f.id)}
                    aria-label={`${f.name}を選択`}
                    className="w-4 h-4 rounded border-sumi-300 text-sea-600 focus:ring-2 focus:ring-sea-600 focus:ring-offset-0"
                  />
                </td>
                <td className="px-2 py-2.5 align-top">
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-pointer">
                          <div className="text-[14px] font-medium text-sumi-900 hover:text-sea-700 transition-colors">{f.name}</div>
                          {f.originalName ? <div className="text-[12px] text-sumi-500">元ファイル名: {f.originalName}</div> : null}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[320px] bg-sumi-900 text-white">
                        <div className="space-y-1.5">
                          <div className="font-semibold text-[13px]">{f.name}</div>
                          {f.summary && <p className="text-[12px] text-sumi-200 leading-relaxed">{f.summary}</p>}
                          <div className="text-[11px] text-sumi-300 pt-1 border-t border-sumi-700">
                            {f.type} · {f.size} · {f.date}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </td>
                <td className="px-2 py-2.5 align-top">
                  <div className="flex flex-wrap gap-1">
                    {f.tags.slice(0, 5).map((tag) => (
                      <TagChip
                        key={tag.id}
                        tag={tag}
                        onSelect={onTagFilterAdd}
                      />
                    ))}
                  </div>
                </td>
                <td className="px-2 py-2.5 align-top">
                  <span className="inline-flex px-2 py-0.5 rounded-full bg-sumi-100 text-[11px] text-sumi-700">{f.type}</span>
                </td>
                <td className="px-2 py-2.5 align-top text-right text-sumi-700">{f.size}</td>
                <td className="px-2 py-2.5 align-top text-sumi-700">{f.folder}</td>
                <td className="px-2 py-2.5 align-top text-sumi-700">{f.date}</td>
                <td className="px-2 py-2.5 align-top text-sumi-700">{f.owner}</td>
                <td className="px-2 py-2.5 align-top text-right">
                  <button className="text-sumi-500 hover:text-sumi-700">⋯</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  align = "left",
  sortConfig,
  onSort,
}: {
  label: string;
  sortKey: keyof LibraryFile;
  align?: "left" | "right";
  sortConfig: { key: keyof LibraryFile; direction: 'asc' | 'desc' } | null;
  onSort: (key: keyof LibraryFile) => void;
}) {
  const isActive = sortConfig?.key === sortKey;
  const direction = sortConfig?.direction;

  return (
    <th
      className={`px-2 py-2 font-medium cursor-pointer hover:bg-sumi-100 hover:text-sumi-800 transition-colors select-none ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => onSort(sortKey)}
    >
      <div className={`flex items-center gap-1.5 ${align === "right" ? "justify-end" : "justify-start"}`}>
        <span className={isActive ? "text-sea-700 font-semibold" : ""}>{label}</span>
        <span className={`text-[11px] transition-opacity ${isActive
          ? "text-sea-600 opacity-100"
          : "text-sumi-400 opacity-0 group-hover:opacity-50"
          }`}>
          {isActive ? (direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </div>
    </th>
  );
}

const TAG_STYLE_MAP: Record<
  LibraryTagCategory,
  { bg: string; text: string; ring: string }
> = {
  docType: { bg: "bg-sea-50", text: "text-sea-800", ring: "ring-sea-300/60" },
  topic: { bg: "bg-wood-50", text: "text-wood-800", ring: "ring-wood-300/60" },
  entity: { bg: "bg-forest-50", text: "text-forest-800", ring: "ring-forest-300/60" },
  state: { bg: "bg-sun-50", text: "text-sun-800", ring: "ring-sun-300/60" },
  extra: { bg: "bg-sumi-100", text: "text-sumi-700", ring: "ring-sumi-300/60" },
};

function TagChip({
  tag,
  onSelect,
  onRemove,
  closable,
}: {
  tag: LibraryTag;
  onSelect?: (tag: LibraryTag) => void;
  onRemove?: (tag: LibraryTag) => void;
  closable?: boolean;
}) {
  const palette = TAG_STYLE_MAP[tag.category];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${palette.bg} ${palette.text} ring-1 ring-inset ${palette.ring}`}
    >
      <button
        type="button"
        onClick={() => onSelect?.(tag)}
        className="flex items-center gap-1 focus:outline-none"
      >
        <span className="whitespace-nowrap">#{tag.label}</span>
      </button>
      {closable && onRemove ? (
        <button
          type="button"
          aria-label={`${tag.label} をフィルタから外す`}
          className="text-[10px] text-current transition hover:opacity-70"
          onClick={() => onRemove(tag)}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

type InsightAction =
  | { type: "view"; payload: "needs_curation" | "duplicates" | "stale_drafts" }
  | { type: "filter"; tag: LibraryTag };

export function AiPanel({
  scope,
  selectedFiles,
  onAction,
  onOpenBulkDialog,
}: {
  scope: LibraryScope;
  selectedFiles: LibraryFile[];
  onAction: (action: InsightAction) => void;
  onOpenBulkDialog: () => void;
}) {
  const selectionCount = selectedFiles.length;
  const scopeLabel = scope === "personal" ? "個人" : scope === "team" ? "チーム" : scope === "org" ? "部署" : "会社";

  const docTypeSummary = useMemo(() => {
    const map = new Map<string, number>();
    selectedFiles.forEach((file) => {
      file.tags
        .filter((tag) => tag.category === "docType")
        .forEach((tag) => map.set(tag.label, (map.get(tag.label) ?? 0) + 1));
    });
    return Array.from(map.entries());
  }, [selectedFiles]);

  return (
    <div className="flex flex-col w-full">
      <div className="px-4 py-3 border-b border-sumi-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12px] font-semibold text-sumi-700 flex items-center gap-1">
              <span className="text-[14px]">✨</span>AIファイルインサイト
            </div>
            <p className="mt-1 text-[11px] text-sumi-500">フォルダの状況やAIサジェストを表示します</p>
          </div>
          <span className="text-[11px] text-sumi-400 border border-sumi-300 rounded-full px-2 py-0.5">Beta</span>
        </div>
        <p className="mt-2 text-[11px] text-sumi-500">閲覧範囲: {scopeLabel}</p>
      </div>

      <div className="flex-1 flex flex-col justify-between text-[13px]">
        <div className="px-4 py-4 space-y-4">
          {selectionCount === 0 ? (
            <>
              <Section title="このフォルダの概要">
                <p className="text-sumi-700 leading-relaxed">
                  補助金申請と経営会議に関する資料が中心です。
                  <br />
                  契約書: 3件 / 見積: 4件 / 議事録: 5件 / マニュアル: 2件
                </p>
              </Section>
              <Section title="AIサジェスト">
                <div className="flex flex-wrap gap-2">
                  <SuggestButton onClick={() => onAction({ type: "view", payload: "duplicates" })}>重複している資料を表示</SuggestButton>
                  <SuggestButton onClick={() => onAction({ type: "view", payload: "stale_drafts" })}>古いドラフトを表示</SuggestButton>
                  <SuggestButton onClick={() => onAction({ type: "view", payload: "needs_curation" })}>タグ未設定の資料を整理</SuggestButton>
                </div>
              </Section>
            </>
          ) : selectionCount === 1 ? (
            <>
              <Section title="資料のインサイト">
                <p className="text-sm font-semibold text-sumi-900">{selectedFiles[0]?.name}</p>
                <p className="mt-2 text-sumi-700 leading-relaxed">{selectedFiles[0]?.summary ?? "AI要約を準備しています。"}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selectedFiles[0]?.tags.map((tag) => (
                    <TagChip key={`insight-${tag.id}`} tag={tag} onSelect={(t) => onAction({ type: "filter", tag: t })} />
                  ))}
                </div>
              </Section>
              <Section title="AIアクション">
                <div className="flex flex-wrap gap-2">
                  <SuggestButton onClick={() => onOpenBulkDialog()}>AIタイトルを整理</SuggestButton>
                  <SuggestButton onClick={() => onAction({ type: "filter", tag: { id: "entity", label: "A社", category: "entity" } })}>
                    A社関連を一覧
                  </SuggestButton>
                  <SuggestButton onClick={() => onAction({ type: "view", payload: "duplicates" })}>類似資料を表示</SuggestButton>
                </div>
              </Section>
            </>
          ) : (
            <>
              <Section title="選択中の資料セット">
                <p className="text-sumi-700">
                  {selectionCount}件の資料を選択中です。
                  <br />
                  {docTypeSummary.length > 0
                    ? docTypeSummary.map(([label, count]) => `${label}: ${count}件`).join(" / ")
                    : "DocType: ー"}
                </p>
              </Section>
              <Section title="AIサジェスト">
                <div className="flex flex-wrap gap-2">
                  <SuggestButton onClick={() => onOpenBulkDialog()}>AIで整理する</SuggestButton>
                  <SuggestButton onClick={() => onAction({ type: "filter", tag: { id: "entity", label: "A社", category: "entity" } })}>
                    A社の資料だけ表示
                  </SuggestButton>
                </div>
              </Section>
            </>
          )}
        </div>
        <div className="border-t border-sumi-200 px-4 py-3 text-[11px] text-sumi-500">
          AIに依頼すると結果がここに表示されます。一部の操作は中央のリストを並べ替え・絞り込みます。
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-sumi-500 uppercase tracking-wide">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function SuggestButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-sumi-200 bg-white px-3 py-1 text-[12px] text-sumi-700 transition hover:border-sea-200 hover:text-sea-700"
    >
      {children}
    </button>
  );
}

export function BulkActionBar({
  count,
  onClear,
  onAction,
}: {
  count: number;
  onClear: () => void;
  onAction: (action: "delete" | "move" | "permission" | "notebook" | "ai") => void;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-between border-b border-sumi-200 bg-sea-50 px-4 py-2 text-[13px] text-sumi-700">
      <span>
        ✓ {count}件選択中
        <button type="button" className="ml-3 text-xs text-sumi-500 underline" onClick={onClear}>
          選択をクリア
        </button>
      </span>
      <div className="flex flex-wrap gap-2 text-sm">
        <BulkButton onClick={() => onAction("delete")}>🗑 削除</BulkButton>
        <BulkButton onClick={() => onAction("move")}>📁 移動</BulkButton>
        <BulkButton onClick={() => onAction("permission")}>👀 権限変更</BulkButton>
        <BulkButton onClick={() => onAction("notebook")}>📓 Notebookに追加</BulkButton>
        <BulkButton onClick={() => onAction("ai")}>🤖 AIで整理</BulkButton>
      </div>
    </div>
  );
}

function BulkButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-sumi-200 bg-white px-3 py-1 text-xs font-medium text-sumi-700 transition hover:border-sea-200 hover:text-sea-800"
    >
      {children}
    </button>
  );
}

export function ActiveFilters({
  filters,
  viewFilter,
  dateFilter,
  onRemoveTag,
  onClearTags,
  onClearView,
  onClearDate,
}: {
  filters: LibraryTag[];
  viewFilter: SmartView;
  dateFilter: DateFilter;
  onRemoveTag: (tag: LibraryTag) => void;
  onClearTags: () => void;
  onClearView: () => void;
  onClearDate: () => void;
}) {
  const viewLabel = viewFilterLabels[viewFilter];
  const hasDate = Boolean(dateFilter.year);
  const hasFilters = filters.length > 0 || viewFilter !== "all" || hasDate;
  if (!hasFilters) return null;
  const dateLabel = formatDateFilterLabel(dateFilter);
  return (
    <div className="mt-3 rounded-lg border border-sumi-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-sumi-600">
        <span className="font-semibold text-sumi-700">フィルタ:</span>
        {viewFilter !== "all" ? <FilterChip label={`ビュー: ${viewLabel}`} onRemove={onClearView} /> : null}
        {hasDate && dateLabel ? <FilterChip label={dateLabel} onRemove={onClearDate} /> : null}
        {filters.map((tag) => (
          <TagChip key={`filter-${tag.id}`} tag={tag} onSelect={() => undefined} onRemove={onRemoveTag} closable />
        ))}
        <button
          type="button"
          className="ml-auto text-xs text-sea-600 underline underline-offset-2"
          onClick={() => {
            onClearTags();
            onClearView();
            onClearDate();
          }}
        >
          クリア
        </button>
      </div>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sumi-100 px-2 py-0.5 text-[11px] text-sumi-700">
      {label}
      <button type="button" className="text-[10px] hover:text-sumi-500" onClick={onRemove}>
        ×
      </button>
    </span>
  );
}

export function AiBulkDialog({
  open,
  files,
  onApply,
  onClose,
}: {
  open: boolean;
  files: LibraryFile[];
  onApply: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-sumi-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-sumi-900">AIで整理する</h2>
            <p className="text-sm text-sumi-500">{files.length}件の資料に対してAIタグ提案を確認できます。</p>
          </div>
          <button type="button" className="text-sumi-500 hover:text-sumi-700" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto px-6 py-4 text-sm text-sumi-700">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-sumi-200 text-[11px] uppercase tracking-wide text-sumi-500">
                <th className="px-2 py-2 w-6">適用</th>
                <th className="px-2 py-2 w-64">タイトル</th>
                <th className="px-2 py-2">DocType</th>
                <th className="px-2 py-2">Topic</th>
                <th className="px-2 py-2">Entity</th>
                <th className="px-2 py-2">State</th>
                <th className="px-2 py-2">Extra</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const docType = file.tags.find((tag) => tag.category === "docType");
                const topic = file.tags.find((tag) => tag.category === "topic");
                const entity = file.tags.find((tag) => tag.category === "entity");
                const state = file.tags.find((tag) => tag.category === "state");
                const extra = file.tags.find((tag) => tag.category === "extra");
                return (
                  <tr key={`bulk-${file.id}`} className="border-b border-sumi-100 hover:bg-sumi-50">
                    <td className="px-2 py-2">
                      <input type="checkbox" defaultChecked />
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-medium text-sumi-900">{file.name}</div>
                      {file.originalName ? <div className="text-[11px] text-sumi-500">→ {file.originalName}</div> : null}
                    </td>
                    <td className="px-2 py-2">{docType?.label ?? "—"}</td>
                    <td className="px-2 py-2">{topic?.label ?? "—"}</td>
                    <td className="px-2 py-2">{entity?.label ?? "—"}</td>
                    <td className="px-2 py-2">{state?.label ?? "—"}</td>
                    <td className="px-2 py-2">{extra?.label ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-sumi-200 px-6 py-4">
          <button type="button" className="rounded-md border border-sumi-300 px-4 py-2 text-sm" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="rounded-md bg-sea-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sea-700"
            onClick={() => {
              onApply();
              onClose();
            }}
          >
            適用
          </button>
        </div>
      </div>
    </div>
  );
}

export function buildDateTree(files: LibraryFile[]): DateTreeYear[] {
  const years = new Map<
    string,
    { count: number; months: Map<string, { count: number; days: Map<string, number> }> }
  >();
  files.forEach((file) => {
    const [year, month, day] = file.dateFolder.split("/");
    if (!years.has(year)) {
      years.set(year, { count: 0, months: new Map() });
    }
    const yearNode = years.get(year)!;
    yearNode.count += 1;
    const monthKey = month;
    if (!yearNode.months.has(monthKey)) {
      yearNode.months.set(monthKey, { count: 0, days: new Map() });
    }
    const monthNode = yearNode.months.get(monthKey)!;
    monthNode.count += 1;
    monthNode.days.set(day, (monthNode.days.get(day) ?? 0) + 1);
  });
  return Array.from(years.entries())
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([year, data]) => ({
      label: `${year}年`,
      value: year,
      count: data.count,
      months: Array.from(data.months.entries())
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([month, monthData]) => ({
          label: `${Number(month)}月`,
          value: month,
          count: monthData.count,
          days: Array.from(monthData.days.entries())
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([day, count]) => ({
              label: `${Number(day)}日`,
              value: day,
              count,
            })),
        })),
    }));
}

export function applyDateFilter(files: LibraryFile[], filter: DateFilter): LibraryFile[] {
  if (!filter.year) return files;
  return files.filter((file) => {
    const [year, month, day] = file.dateFolder.split("/");
    if (filter.day && filter.month) {
      return year === filter.year && month === filter.month && day === filter.day;
    }
    if (filter.month) {
      return year === filter.year && month === filter.month;
    }
    return year === filter.year;
  });
}

export function applyViewFilter(files: LibraryFile[], view: SmartView): LibraryFile[] {
  switch (view) {
    case "needs_curation":
      return files.filter((file) => file.tags.length < 5);
    case "duplicates":
      return files.filter((file, index) => index % 2 === 0);
    case "stale_drafts":
      return files.filter((file) =>
        file.tags.some((tag) => /ドラフト|レビュー待ち/i.test(tag.label)),
      );
    default:
      return files;
  }
}

export function applyTagFilters(files: LibraryFile[], filters: LibraryTag[]): LibraryFile[] {
  if (filters.length === 0) return files;
  return files.filter((file) =>
    filters.every((filter) => file.tags.some((tag) => tag.id === filter.id)),
  );
}

export function formatDateFilterLabel(filter: DateFilter): string | null {
  if (!filter.year) return null;
  if (filter.day && filter.month) {
    return `${filter.year}年 ${Number(filter.month)}月 ${Number(filter.day)}日`;
  }
  if (filter.month) {
    return `${filter.year}年 ${Number(filter.month)}月`;
  }
  return `${filter.year}年`;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  itemCount,
  itemType = "ファイル",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  itemCount: number;
  itemType?: string;
}) {
  const getMessage = () => {
    if (itemCount > 10) {
      return `${itemCount}件の大量の${itemType}を削除しようとしています。本当によろしいですか？`;
    }
    return `選択した${itemCount}件の${itemType}を完全に削除します。`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="text-[20px]">⚠️</span>
            {itemType}を削除しますか？
          </DialogTitle>
          <DialogDescription className="text-sumi-600 pt-2">
            {getMessage()}
            <br />
            <span className="text-red-600 font-medium">この操作は取り消すことができません。</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-md border border-sumi-300 text-sumi-700 hover:bg-sumi-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
          >
            削除する
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
