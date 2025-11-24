import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_TENANT, DEFAULT_USER } from "@/lib/scope";

export const runtime = "nodejs";

type RagFolder = {
  path?: string;
  scope?: string;
  count?: number;
};

type TreeNode = {
  path: string;
  name: string;
  scope?: string;
  count?: number;
  children?: TreeNode[];
};

const SCOPE_FILTERS: Record<string, string[]> = {
  personal: ["personal"],
  team: ["org", "team"],
  org: ["org", "department"],
  company: ["company", "org", "global", "team", "mixed"],
};

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams;
  const scope = (search.get("scope") || "").toLowerCase();
  const tenant = search.get("tenant")?.trim() || DEFAULT_TENANT;
  const userId = search.get("user_id")?.trim() || DEFAULT_USER;

  const baseUrl =
    process.env.RAG_SERVER_URL ||
    process.env.RAG_API_BASE ||
    process.env.RAG_BASE_URL ||
    "http://127.0.0.1:3002";
  const targetUrl = new URL("/library/files/folders", baseUrl.replace(/\/$/, ""));
  targetUrl.searchParams.set("tenant", tenant);
  targetUrl.searchParams.set("user_id", userId);

  const response = await fetch(targetUrl.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as { folders?: RagFolder[] } | null;
  if (!response.ok) {
    const detail = payload?.["detail"] || payload?.["error"] || response.statusText;
    return NextResponse.json({ error: "library_tree_failed", detail }, { status: response.status });
  }

  const normalized = Array.isArray(payload?.folders) ? payload!.folders : [];
  const filtered = scope ? normalized.filter((folder) => folderMatchesScope(folder, scope)) : normalized;
  const tree = buildTree(filtered);

  return NextResponse.json(tree);
}

function folderMatchesScope(folder: RagFolder, filter: string) {
  if (!filter) return true;
  const normalized = String(folder?.scope || "").toLowerCase() || "personal";
  const allowed = SCOPE_FILTERS[filter] || [filter];
  if (normalized === "mixed") {
    return filter !== "personal";
  }
  return allowed.includes(normalized);
}

function buildTree(folders: RagFolder[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();

  function ensureNode(path: string) {
    let node = nodeMap.get(path);
    if (!node) {
      node = {
        path,
        name: deriveName(path),
        count: 0,
        children: [],
      };
      nodeMap.set(path, node);
    }
    return node;
  }

  const sorted = folders
    .map((folder) => ({
      path: normalizeFolder(folder?.path || "/"),
      scope: folder?.scope?.toLowerCase(),
      count: typeof folder?.count === "number" ? folder.count : undefined,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const root = ensureNode("/");
  root.name = "ルート";

  for (const folder of sorted) {
    const node = ensureNode(folder.path);
    node.scope = folder.scope || node.scope;
    if (typeof folder.count === "number") {
      node.count = folder.count;
    }
    if (folder.path === "/") continue;
    const parentPath = getParentPath(folder.path);
    const parent = ensureNode(parentPath);
    if (!parent.children) parent.children = [];
    if (!parent.children.find((child) => child.path === node.path)) {
      parent.children.push(node);
    }
  }

  sortTree(root);
  return [root];
}

function sortTree(node: TreeNode) {
  if (!node.children || node.children.length === 0) return;
  node.children.sort((a, b) => a.path.localeCompare(b.path));
  node.children.forEach(sortTree);
}

function getParentPath(path: string) {
  if (!path || path === "/") return "/";
  const segments = path.split("/").filter(Boolean);
  if (segments.length <= 1) return "/";
  return `/${segments.slice(0, -1).join("/")}` || "/";
}

function deriveName(path: string) {
  if (!path || path === "/") return "ルート";
  const segments = path.split("/").filter(Boolean);
  return segments.at(-1) || path;
}

function normalizeFolder(path: string) {
  if (!path) return "/";
  let cleaned = path.trim();
  if (!cleaned.startsWith("/")) cleaned = `/${cleaned}`;
  cleaned = cleaned.replace(/\/+/g, "/");
  return cleaned || "/";
}
