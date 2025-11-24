import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_TENANT, DEFAULT_USER } from "@/lib/scope";

export const runtime = "nodejs";

type RagListResponse = {
  items?: any[];
  count?: number;
};

const STORAGE_SCOPE_MAP: Record<string, string[]> = {
  personal: ["personal"],
  team: ["org", "team"],
  org: ["org", "department"],
  company: ["company", "org", "global", "team", "department"],
};

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams;
  const scope = (search.get("scope") || "personal").toLowerCase();
  const searchQuery = (search.get("q") || "").trim().toLowerCase();
  const folder = normalizeFolder(search.get("folder") || "/");
  const tenant = search.get("tenant")?.trim() || DEFAULT_TENANT;
  const userId = search.get("user_id")?.trim() || DEFAULT_USER;

  const baseUrl =
    process.env.RAG_SERVER_URL ||
    process.env.RAG_API_BASE ||
    process.env.RAG_BASE_URL ||
    "http://127.0.0.1:3002";
  const listUrl = new URL("/library/files", baseUrl.replace(/\/$/, ""));
  listUrl.searchParams.set("tenant", tenant);
  listUrl.searchParams.set("user_id", userId);
  if (folder && folder !== "/") {
    listUrl.searchParams.set("folder_path", folder);
  }

  const response = await fetch(listUrl.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as RagListResponse | null;

  if (!response.ok) {
    const detail = payload?.["detail"] || payload?.["error"] || response.statusText;
    return NextResponse.json({ error: "library_list_failed", detail }, { status: response.status });
  }

  const files = Array.isArray(payload?.items) ? payload!.items : [];
  const filtered = files.filter((item) => matchesScope(item?.scope, scope));
  const searched = searchQuery
    ? filtered.filter((item) => {
        const haystack = `${item?.original_name ?? ""} ${item?.folder_path ?? ""} ${item?.doc_type ?? ""} ${
          item?.status ?? ""
        }`.toLowerCase();
        return haystack.includes(searchQuery);
      })
    : filtered;

  return NextResponse.json({ files: searched });
}

function normalizeFolder(path: string) {
  if (!path) return "/";
  let cleaned = path.trim();
  if (!cleaned.startsWith("/")) cleaned = `/${cleaned}`;
  cleaned = cleaned.replace(/\/+/g, "/");
  return cleaned || "/";
}

function matchesScope(scopeValue: unknown, filter: string) {
  if (!filter) return true;
  const normalized = String(scopeValue || "").toLowerCase();
  if (!normalized) return filter === "personal";
  const allowed = STORAGE_SCOPE_MAP[filter] || [filter];
  if (allowed.includes("company") && normalized === "mixed") return true;
  return allowed.includes(normalized);
}
