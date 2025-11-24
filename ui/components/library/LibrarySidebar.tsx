"use client";

import { useCallback, useEffect, useState } from "react";

import { TAG_MASTER, TagFilterState } from "@/lib/tags";
import type { Scope } from "./LibraryLayout";

type SidebarProps = {
  scope: Scope;
  currentFolder: string;
  onFolderChange: (path: string) => void;
  tags: TagFilterState;
  onTagsChange: (tags: TagFilterState) => void;
};

type FolderTreeProps = {
  scope: Scope;
  currentFolder: string;
  onFolderChange: (path: string) => void;
};

type FolderNode = {
  path: string;
  name: string;
  count?: number;
  children?: FolderNode[];
};

type ViewItem = {
  key: string;
  label: string;
  icon: string;
};

const VIEWS: ViewItem[] = [
  { key: "all", label: "すべて", icon: "📥" },
  { key: "recent", label: "最近", icon: "🕒" },
  { key: "draft", label: "作成途中", icon: "📝" },
  { key: "favorite", label: "よく使う", icon: "⭐" },
];

export function LibrarySidebar({ scope, currentFolder, onFolderChange, tags, onTagsChange }: SidebarProps) {
  const [activeView, setActiveView] = useState<string>("all");

  return (
    <div className="flex h-full flex-col text-[14px] text-sumi-900">
      <div className="px-4 py-4">
        <div className="mb-2 flex items-center gap-1 text-[12px] font-medium text-sumi-600">
          <span>👁</span>
          <span>ビュー</span>
        </div>
        <nav className="space-y-1.5">
          {VIEWS.map((view) => (
            <SidebarItem
              key={view.key}
              label={view.label}
              icon={<span>{view.icon}</span>}
              active={activeView === view.key}
              onClick={() => setActiveView(view.key)}
            />
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-hidden border-t border-sumi-200 bg-sumi-50 px-4 py-4 overflow-y-auto">
        <div className="mb-2 flex items-center gap-1 text-[12px] font-medium text-sumi-600">
          <span>📁</span>
          <span>フォルダ</span>
        </div>
        <FolderTree scope={scope} currentFolder={currentFolder} onFolderChange={onFolderChange} />

        <div className="mt-6 mb-2 flex items-center gap-1 text-[12px] font-medium text-sumi-600">
          <span>🏷️</span>
          <span>タグで絞り込み</span>
        </div>
        <div className="space-y-4">
          <FilterSection
            title="文書種別"
            options={TAG_MASTER.doc_types}
            selected={tags.doc_type}
            onChange={(val) => onTagsChange({ ...tags, doc_type: val })}
          />
          <FilterSection
            title="トピック"
            options={TAG_MASTER.topics}
            selected={tags.topic}
            onChange={(val) => onTagsChange({ ...tags, topic: val })}
          />
          <FilterSection
            title="状態"
            options={TAG_MASTER.states}
            selected={tags.state}
            onChange={(val) => onTagsChange({ ...tags, state: val })}
          />
        </div>
      </div>
    </div>
  );
}

function SidebarItem({
  label,
  active,
  icon,
  onClick,
}: {
  label: string;
  active?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[14px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600 ${active
        ? "border border-sea-500 bg-sea-50 text-sea-800 shadow-sm"
        : "border border-transparent text-sumi-700 hover:border-sumi-200 hover:bg-sumi-100"
        }`}
      aria-pressed={active}
    >
      {active && <span className="absolute -left-2 h-8 w-1 rounded-sm bg-sea-700" aria-hidden="true" />}
      {icon}
      <span>{label}</span>
    </button>
  );
}

function FolderTree({ scope, currentFolder, onFolderChange }: FolderTreeProps) {
  const [nodes, setNodes] = useState<FolderNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>(["/"]));
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/backend/library/tree?scope=${scope}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("フォルダ構造の取得に失敗しました");
        }
        const payload = await response.json().catch(() => null);
        return normalizeNodes(payload);
      })
      .then((nextNodes) => {
        if (cancelled) return;
        setNodes(nextNodes);
      })
      .catch((err: Error) => {
        if (cancelled || err.name === "AbortError") return;
        setError(err.message || "フォルダ構造の取得に失敗しました");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [scope, retryCount]);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  if (loading && nodes.length === 0) {
    return <div className="text-xs text-gray-500 px-2 py-2">読み込み中…</div>;
  }

  if (error) {
    return (
      <div className="text-xs text-red-500 px-2 py-2">
        {error}
        <button
          className="ml-2 underline"
          onClick={() => {
            setNodes([]);
            setExpanded(new Set(["/"]));
            setError(null);
            setRetryCount((count) => count + 1);
          }}
        >
          再試行
        </button>
      </div>
    );
  }

  if (!nodes.length) {
    return <div className="text-xs text-gray-500 px-2 py-2">フォルダがありません。</div>;
  }

  return (
    <div className="space-y-0.5 max-h-full overflow-y-auto pr-1">
      {nodes.map((node) => (
        <FolderTreeNode
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          currentFolder={currentFolder}
          onFolderChange={onFolderChange}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}

function normalizeNodes(input: unknown): FolderNode[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => {
      if (typeof value !== "object" || value === null) return null;
      const path = typeof (value as { path?: unknown }).path === "string" ? (value as { path: string }).path : "/";
      const nameSource = (value as { name?: unknown }).name;
      const countSource = (value as { count?: unknown }).count;
      const childrenSource = (value as { children?: unknown }).children;
      const name =
        typeof nameSource === "string"
          ? nameSource
          : path === "/"
            ? "ルート"
            : path.split("/").filter(Boolean).slice(-1)[0] ?? path;
      return {
        path,
        name,
        count: typeof countSource === "number" ? countSource : undefined,
        children: normalizeNodes(childrenSource),
      };
    })
    .filter(Boolean) as FolderNode[];
}

type FolderTreeNodeProps = {
  node: FolderNode;
  depth: number;
  expanded: Set<string>;
  currentFolder: string;
  onFolderChange: (path: string) => void;
  onToggle: (path: string) => void;
};

function FolderTreeNode({ node, depth, expanded, currentFolder, onFolderChange, onToggle }: FolderTreeNodeProps) {
  const hasChildren = Boolean(node.children && node.children.length);
  const isExpanded = expanded.has(node.path);
  const isCurrent = currentFolder === node.path;

  return (
    <div>
      <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 12 + 4}px` }}>
        {hasChildren ? (
          <button
            type="button"
            className="h-5 w-5 text-[11px] text-neutral-500 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.path);
            }}
            aria-label={isExpanded ? "フォルダを閉じる" : "フォルダを開く"}
          >
            {isExpanded ? "−" : "+"}
          </button>
        ) : (
          <span className="h-5 w-5" aria-hidden="true" />
        )}
        <button
          type="button"
          className={`flex flex-1 items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-left text-[14px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-600 ${isCurrent ? "bg-sea-50 text-sea-800" : "hover:bg-sumi-100"
            }`}
          onClick={() => onFolderChange(node.path)}
          aria-current={isCurrent ? "true" : undefined}
        >
          <span className="flex-1 truncate">{node.name}</span>
          {typeof node.count === "number" && (
            <span className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600">
              {node.count}
            </span>
          )}
        </button>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <FolderTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              currentFolder={currentFolder}
              onFolderChange={onFolderChange}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
function FilterSection({
  title,
  options,
  selected,
  onChange
}: {
  title: string;
  options: string[];
  selected?: string | null;
  onChange: (val: string | null) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-neutral-500">{title}</div>
      <div className="space-y-0.5">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-100 cursor-pointer">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-sumi-300 text-sea-600 focus:ring-sea-500"
              checked={selected === opt}
              onChange={() => onChange(selected === opt ? null : opt)}
            />
            <span className="text-[13px] text-sumi-700">{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
