"use client";

export type RagPhase = "retrieval" | "rerank" | "generation" | "done";

type ProgressTrackProps = {
  phase: RagPhase;
  metadata?: {
    candidates?: number;
    tokens?: number;
  };
};

/**
 * ProgressTrack - Visual indicator of RAG pipeline progress
 * Shows current phase with badge-style UI
 */
export function ProgressTrack({ phase, metadata }: ProgressTrackProps) {
  const steps: Array<{ key: RagPhase; label: string }> = [
    { key: "retrieval", label: "検索" },
    { key: "rerank", label: "再ランク" },
    { key: "generation", label: "生成" },
    { key: "done", label: "完了" },
  ];

  const getStepIndex = (step: RagPhase) =>
    steps.findIndex((s) => s.key === step);
  const currentIndex = getStepIndex(phase);

  return (
    <div className="flex items-center gap-2">
      {steps.map((step, idx) => {
        const isActive = idx === currentIndex;
        const isComplete = idx < currentIndex;
        const isPending = idx > currentIndex;

        return (
          <div key={step.key} className="flex items-center gap-1">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? "bg-blue-100 text-blue-800 ring-2 ring-blue-300"
                  : isComplete
                  ? "bg-green-100 text-green-800"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {step.label}
              {isActive && metadata && (
                <span className="ml-1 text-[10px] text-slate-600">
                  {step.key === "retrieval" && metadata.candidates
                    ? `${metadata.candidates}件`
                    : step.key === "generation" && metadata.tokens
                    ? `${metadata.tokens}tok`
                    : ""}
                </span>
              )}
            </span>
            {idx < steps.length - 1 && (
              <svg
                className="w-3 h-3 text-slate-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
