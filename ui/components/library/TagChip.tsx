import React from "react";
import { cn } from "@/lib/utils";

interface TagChipProps {
  label: string;
  type: "doc_type" | "topic" | "entity" | "state" | "extra";
  onClick?: () => void;
  className?: string;
}

const TYPE_STYLES = {
  doc_type: "bg-sea-50 text-sea-800 border-sea-200",
  topic: "bg-wood-50 text-wood-500 border-wood-200",
  entity: "bg-forest-50 text-forest-500 border-forest-200",
  state: "bg-sun-50 text-sun-500 border-sun-200",
  extra: "bg-sumi-50 text-sumi-700 border-sumi-200",
};

export function TagChip({ label, type, onClick, className }: TagChipProps) {
  if (!label) return null;

  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity",
        TYPE_STYLES[type],
        className
      )}
    >
      {label}
    </span>
  );
}
