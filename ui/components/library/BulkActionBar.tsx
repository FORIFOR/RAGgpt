"use client";

type Props = {
  selectedCount: number;
  selectedIds: string[];
  onCompleted: () => void;
};

export function BulkActionBar({ selectedCount, selectedIds, onCompleted }: Props) {
  const emitAction = (action: string) => {
    document.dispatchEvent(
      new CustomEvent("library:bulkAction", {
        detail: { action, ids: selectedIds },
      }),
    );
  };

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(`${selectedCount} 件の資料を削除します。よろしいですか？`);
    if (!confirmed) return;
    const response = await fetch("/api/backend/library/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: selectedIds }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = (payload as { error?: string } | null)?.error ?? "削除に失敗しました";
      alert(message);
      return;
    }
    onCompleted();
  };

  return (
    <div
      role="toolbar"
      aria-label="資料一括操作"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-sumi-200 bg-sea-50 px-6 py-3 text-[14px] text-sumi-800"
    >
      <div className="font-semibold text-sea-900">✓ {selectedCount} 件選択中</div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-[4px] border border-red-300 bg-white px-3 py-1.5 text-[13px] text-red-700 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
        >
          削除
        </button>
        <button
          type="button"
          onClick={() => emitAction("move")}
          className="rounded-[4px] border border-sumi-300 bg-white px-3 py-1.5 text-[13px] text-sumi-800 transition hover:bg-sumi-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600"
        >
          移動
        </button>
        <button
          type="button"
          onClick={() => emitAction("scope")}
          className="rounded-[4px] border border-sumi-300 bg-white px-3 py-1.5 text-[13px] text-sumi-800 transition hover:bg-sumi-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600"
        >
          権限変更
        </button>
        <button
          type="button"
          onClick={() => emitAction("notebook")}
          className="rounded-[4px] border border-sumi-300 bg-white px-3 py-1.5 text-[13px] text-sumi-800 transition hover:bg-sumi-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600"
        >
          Notebookに追加
        </button>
        <button
          type="button"
          onClick={() => emitAction("ai")}
          className="rounded-[4px] border border-sumi-300 bg-white px-3 py-1.5 text-[13px] text-sumi-800 transition hover:bg-sumi-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600"
        >
          AIで整理
        </button>
      </div>
    </div>
  );
}
