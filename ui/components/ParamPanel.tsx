"use client";

export type RagParams = {
  topK: number;
  useRerank: boolean;
  retriever: "local-hybrid" | "mcp";
  profile: "quiet" | "balanced" | "max";
};

type ParamPanelProps = {
  value: RagParams;
  onChange: (params: RagParams) => void;
};

/**
 * ParamPanel - User-facing controls for RAG parameters
 * Allows users to adjust search quality vs. performance
 */
export function ParamPanel({ value, onChange }: ParamPanelProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-3 bg-white border border-slate-200 rounded-lg">
      {/* TopK Slider */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-700">検索件数</label>
        <input
          type="range"
          min={10}
          max={50}
          step={5}
          value={value.topK}
          onChange={(e) =>
            onChange({ ...value, topK: parseInt(e.target.value) })
          }
          className="w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
          aria-label="検索件数"
          aria-valuemin={10}
          aria-valuemax={50}
          aria-valuenow={value.topK}
        />
        <span className="text-xs font-mono text-slate-600 w-8" aria-live="polite">
          {value.topK}
        </span>
      </div>

      {/* Rerank Toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value.useRerank}
          onChange={(e) =>
            onChange({ ...value, useRerank: e.target.checked })
          }
          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
        />
        <span className="text-xs font-medium text-slate-700">再ランク</span>
      </label>

      {/* Retriever Selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-700">検索</label>
        <select
          value={value.retriever}
          onChange={(e) =>
            onChange({
              ...value,
              retriever: e.target.value as "local-hybrid" | "mcp",
            })
          }
          className="text-xs border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="検索方法"
        >
          <option value="local-hybrid">Local Hybrid</option>
          <option value="mcp">MCP</option>
        </select>
      </div>

      {/* Profile Selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-700">
          モード
        </label>
        <select
          value={value.profile}
          onChange={(e) =>
            onChange({
              ...value,
              profile: e.target.value as "quiet" | "balanced" | "max",
            })
          }
          className="text-xs border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="パフォーマンスモード"
        >
          <option value="quiet">Quiet (静音)</option>
          <option value="balanced">Balanced (標準)</option>
          <option value="max">Max (最大)</option>
        </select>
      </div>

      {/* Profile explanation tooltip */}
      <div className="text-[10px] text-slate-500 max-w-md">
        {value.profile === "quiet" &&
          "静音モード: 再ランク無効、検索数を抑え、CPU使用率を最小化"}
        {value.profile === "balanced" && "標準モード: 精度と速度のバランス"}
        {value.profile === "max" &&
          "最大モード: すべての機能を有効化（CPU負荷大）"}
      </div>
    </div>
  );
}
