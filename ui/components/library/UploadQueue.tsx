"use client";

export type UploadStatus = "uploading" | "success" | "error";

export type UploadItem = {
  id: string;
  file: File;
  filename: string;
  progress: number;
  status: UploadStatus;
  error?: string;
};

type Props = {
  items: UploadItem[];
  onRemoveItem?: (id: string) => void;
};

export function UploadQueue({ items, onRemoveItem }: Props) {
  if (!items.length) return null;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="rounded-md border border-sumi-200 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between text-[13px] text-sumi-600">
            <span className="truncate font-medium text-sumi-900">{item.filename}</span>
            <span>{statusLabel(item)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sumi-100">
            <div
              className={`h-full ${statusColor(item)}`}
              style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
            />
          </div>
          {item.error && <div className="mt-1 text-[12px] text-red-600">{item.error}</div>}
          {item.status !== "uploading" && onRemoveItem && (
            <div className="mt-1 text-right">
              <button
                type="button"
                className="text-[12px] text-sumi-600 underline hover:text-sumi-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600"
                onClick={() => onRemoveItem(item.id)}
              >
                履歴から削除
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function statusLabel(item: UploadItem) {
  switch (item.status) {
    case "uploading":
      return `${item.progress}%`;
    case "success":
      return "完了";
    case "error":
      return "エラー";
    default:
      return "";
  }
}

function statusColor(item: UploadItem) {
  switch (item.status) {
    case "success":
      return "bg-emerald-400";
    case "error":
      return "bg-red-400";
    default:
      return "bg-sea-500";
  }
}
