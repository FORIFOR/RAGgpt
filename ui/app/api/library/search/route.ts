import { Buffer } from "buffer";
import { NextRequest, NextResponse } from "next/server";

const SEARCH_BASE =
  process.env.LIBRARY_SEARCH_BASE_URL ||
  process.env.ELASTICSEARCH_URL ||
  "";
const SEARCH_INDEX =
  process.env.LIBRARY_SEARCH_INDEX ||
  process.env.ELASTICSEARCH_LIBRARY_INDEX ||
  "";
const SEARCH_API_KEY = process.env.LIBRARY_SEARCH_API_KEY || "";
const SEARCH_BASIC_AUTH = process.env.LIBRARY_SEARCH_BASIC_AUTH || "";
const DEFAULT_LIMIT = Number(process.env.LIBRARY_SEARCH_LIMIT || "25");

export const runtime = "nodejs";

type SearchHit = {
  id: string;
  path: string;
  title: string;
  contentType?: string;
  size?: number;
  updatedAt?: number;
  tags?: string[];
  snippet?: string;
};

const MIME_GROUPS: Record<string, string[]> = {
  pdf: ["application/pdf"],
  office: [
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  text: ["text/plain", "text/csv", "text/markdown"],
};

function buildAuthHeader() {
  if (SEARCH_API_KEY) {
    return `ApiKey ${SEARCH_API_KEY}`;
  }
  if (SEARCH_BASIC_AUTH) {
    const encoded = Buffer.from(SEARCH_BASIC_AUTH.trim()).toString("base64");
    return `Basic ${encoded}`;
  }
  return null;
}

function clampLimit(value: number) {
  if (Number.isNaN(value) || value <= 0) return DEFAULT_LIMIT;
  if (value > 100) return 100;
  return value;
}

export async function GET(req: NextRequest) {
  if (!SEARCH_BASE || !SEARCH_INDEX) {
    return NextResponse.json(
      { error: "library_search_not_configured" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const pathPrefix = url.searchParams.get("path_prefix")?.trim() || "";
  const type = (url.searchParams.get("type") || "all").toLowerCase();
  const updatedAfter = url.searchParams.get("updated_after")?.trim() || "";
  const limit = clampLimit(Number(url.searchParams.get("limit") || DEFAULT_LIMIT));

  const filters: any[] = [];
  if (pathPrefix) {
    filters.push({
      prefix: {
        "path.keyword": pathPrefix.replace(/\/+$/, ""),
      },
    });
  }
  if (type !== "all" && MIME_GROUPS[type]) {
    filters.push({
      terms: {
        "content_type.keyword": MIME_GROUPS[type],
      },
    });
  }
  if (updatedAfter) {
    filters.push({
      range: {
        updated_at: {
          gte: updatedAfter,
        },
      },
    });
  }

  let queryBody: Record<string, any>;
  if (query) {
    queryBody = {
      bool: {
        must: [
          {
            simple_query_string: {
              query,
              default_operator: "and",
              fields: [
                "title^3",
                "path.keyword^2",
                "content",
                "tags^2",
              ],
            },
          },
        ],
        filter: filters,
      },
    };
  } else if (filters.length > 0) {
    queryBody = { bool: { filter: filters } };
  } else {
    queryBody = { match_all: {} };
  }

  const highlight = {
    pre_tags: ["<mark>"],
    post_tags: ["</mark>"],
    fields: {
      content: { fragment_size: 160, number_of_fragments: 1 },
      path: { number_of_fragments: 1 },
    },
  };

  const body = JSON.stringify({
    size: limit,
    query: queryBody,
    highlight,
    sort: [{ updated_at: { order: "desc" } }],
  });

  const target = `${SEARCH_BASE.replace(/\/+$/, "")}/${SEARCH_INDEX.replace(
    /^\/+/,
    "",
  )}/_search`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const authHeader = buildAuthHeader();
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  let esResponse: Response;
  try {
    esResponse = await fetch(target, {
      method: "POST",
      headers,
      body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "library_search_failed", detail: message },
      { status: 502 },
    );
  }

  if (!esResponse.ok) {
    const text = await esResponse.text().catch(() => "");
    return NextResponse.json(
      { error: "library_search_failed", detail: text || esResponse.statusText },
      { status: esResponse.status },
    );
  }

  const payload = await esResponse.json();
  const hits = payload?.hits?.hits ?? [];
  const items: SearchHit[] = hits.map((hit: any) => {
    const source = hit?._source ?? {};
    const highlightText =
      hit?.highlight?.content?.[0] ||
      hit?.highlight?.path?.[0] ||
      source.summary ||
      "";
    const tagsArray = Array.isArray(source.tags)
      ? source.tags.filter((tag: unknown) => typeof tag === "string")
      : undefined;
    return {
      id: String(hit?._id ?? source.path ?? crypto.randomUUID()),
      path: String(source.path ?? ""),
      title: source.title || source.file_name || source.path,
      contentType: source.content_type || source.mime_type,
      size:
        typeof source.size === "number"
          ? source.size
          : typeof source.bytes === "number"
            ? source.bytes
            : undefined,
      updatedAt: source.updated_at
        ? Number(new Date(source.updated_at))
        : undefined,
      tags: tagsArray,
      snippet: highlightText,
    };
  });

  return NextResponse.json({
    items,
    total: payload?.hits?.total?.value ?? items.length,
    took: payload?.took ?? 0,
  });
}
