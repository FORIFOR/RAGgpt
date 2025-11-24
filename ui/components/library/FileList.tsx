import { TagChip } from "./TagChip";
import type { Scope } from "./LibraryLayout";

export type FileRow = {
  id: string;
  title: string;
  originalName: string;
  tags: {
    doc_type?: string | null;
    topic?: string | null;
    entity?: string | null;
    state?: string | null;
    extras?: string[];
  } | null;
  scope: Scope;
  folderPath: string;
  sizeLabel: string;
  uploadedAt: string;
  uploadedBy: string;
};

type Props = {
  files: FileRow[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
};

export function FileList({ files, selectedIds, onToggleSelect }: Props) {
  if (!files.length) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-12 text-center text-[14px] text-sumi-600">
        このフォルダにはまだ資料がありません。上部の「アップロード」もしくはドラッグ＆ドロップで追加してください。
      </div>
    );
  }

  return (
    <table className="min-w-full border-collapse text-[14px] text-sumi-900">
      <thead className="bg-sumi-50 text-[11px] font-medium uppercase tracking-wide text-sumi-600 border-b border-sumi-200">
        <tr>
          <th className="w-10 px-3 py-3 text-left">
            <span className="sr-only">選択</span>
          </th>
          <th className="px-3 py-3 text-left">ファイル名</th>
          <th className="px-3 py-3 text-left">タグ</th>
          <th className="px-3 py-3 text-left">範囲</th>
          <th className="px-3 py-3 text-right">サイズ</th>
          <th className="px-3 py-3 text-left">フォルダ</th>
          <th className="px-3 py-3 text-left">アップロード日</th>
          <th className="px-3 py-3 text-left">アップロード者</th>
          <th className="w-10 px-3 py-3 text-left" />
        </tr>
      </thead>
      <tbody className="divide-y divide-sumi-200 bg-white">
        {files.map((file) => {
          const selected = selectedIds.includes(file.id);
          return (
            <tr
              key={file.id}
              className={`transition hover:bg-sea-50 ${selected ? "bg-sea-50" : ""}`}
            >
              <td className="px-3 py-4 align-top">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(file.id)}
                  className="h-4 w-4 cursor-pointer rounded border-sumi-300 text-sea-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600"
                  aria-label={`${file.title} を選択`}
                />
              </td>
              <td className="px-3 py-4 align-top">
                <div className="font-medium text-sumi-900">{file.title}</div>
                <div className="mt-1 text-[12px] text-sumi-500">元ファイル名: {file.originalName}</div>
              </td>
              <td className="px-3 py-4 align-top">
                <div className="flex flex-wrap gap-1 max-w-[300px]">
                  {file.tags?.doc_type && <TagChip type="doc_type" label={file.tags.doc_type} />}
                  {file.tags?.topic && <TagChip type="topic" label={file.tags.topic} />}
                  {file.tags?.entity && <TagChip type="entity" label={file.tags.entity} />}
                  {file.tags?.state && <TagChip type="state" label={file.tags.state} />}
                  {file.tags?.extras?.map((extra) => (
                    <TagChip key={extra} type="extra" label={extra} />
                  ))}
                  {!file.tags && <span className="text-xs text-sumi-400">-</span>}
                </div>
              </td>
              <td className="px-3 py-4 align-top">
                <ScopeBadge scope={file.scope} />
              </td>
              <td className="px-3 py-4 align-top text-right text-sumi-600">{file.sizeLabel}</td>
              <td className="px-3 py-4 align-top text-sumi-600">{formatFolderDisplay(file.folderPath)}</td>
              <td className="px-3 py-4 align-top text-sumi-600 whitespace-nowrap">{file.uploadedAt}</td>
              <td className="px-3 py-4 align-top text-sumi-600">{file.uploadedBy}</td>
              <td className="px-3 py-4 align-top text-right text-sumi-400">
                <button
                  type="button"
                  className="rounded px-2 py-1 hover:text-sumi-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600"
                  aria-label={`${file.title} の操作`}
                >
                  ⋯
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ScopeBadge({ scope }: { scope: Scope }) {
  const map: Record<Scope, { label: string; className: string }> = {
    personal: { label: "個人", className: "border border-sea-500 text-sea-800 bg-white" },
    team: { label: "チーム", className: "border border-forest-400 text-forest-700 bg-white" },
    org: { label: "部署", className: "border border-sun-400 text-sun-700 bg-white" },
    company: { label: "会社", className: "border border-sumi-300 text-sumi-700 bg-white" },
  };
  const value = map[scope];

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${value.className}`}>
      {value.label}
    </span>
  );
}

function DocTypeBadge({ label }: { label: string }) {
  const normalized = label?.toLowerCase() || "other";
  const map: Record<string, { text: string; className: string }> = {
    pdf: { text: "PDF", className: "bg-rose-50 text-rose-700 border border-rose-200" },
    document: { text: "WORD", className: "bg-indigo-50 text-indigo-700 border border-indigo-200" },
    sheet: { text: "SHEET", className: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
    presentation: { text: "SLIDE", className: "bg-amber-50 text-amber-700 border border-amber-200" },
    note: { text: "NOTE", className: "bg-sumi-100 text-sumi-700 border border-sumi-200" },
    draft: { text: "DRAFT", className: "bg-purple-50 text-purple-700 border border-purple-200" },
    other: { text: "OTHER", className: "bg-sumi-100 text-sumi-600 border border-sumi-200" },
  };
  const fallback = { text: label || "OTHER", className: "border border-sumi-200 bg-sumi-100 text-sumi-600" };
  const value = map[normalized] || fallback;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${value.className}`}>
      {value.text}
    </span>
  );
}

function formatFolderDisplay(path: string) {
  if (!path || path === "/") return "ルート";
  return path.replace(/^\/+/, "").split("/").join(" / ");
}
