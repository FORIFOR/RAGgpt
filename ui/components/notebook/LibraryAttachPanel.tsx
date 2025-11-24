export type LibraryAttachPanelProps = {
  onPickFolder: () => void;
  onPickFiles: () => void;
};

export function LibraryAttachPanel({ onPickFolder, onPickFiles }: LibraryAttachPanelProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-700">Nextcloud ライブラリから追加</p>
      <p className="text-xs text-slate-500">
        社内の Nextcloud フォルダとファイルを参照して、この Notebook に紐付けます。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPickFolder}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          フォルダをリンク
        </button>
        <button
          type="button"
          onClick={onPickFiles}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          ファイルを選択
        </button>
      </div>
    </div>
  );
}
