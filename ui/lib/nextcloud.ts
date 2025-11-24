import { Buffer } from "buffer";

import { XMLParser } from "fast-xml-parser";

import { type BackendScope } from "@/lib/backend";

const REQUIRED_ENV_GROUPS: ReadonlyArray<readonly string[]> = [
  ["NEXTCLOUD_WEBDAV_BASE_URL"],
  ["NEXTCLOUD_USERNAME", "NEXTCLOUD_WEBDAV_USERNAME"],
  ["NEXTCLOUD_APP_PASSWORD", "NEXTCLOUD_WEBDAV_PASSWORD"],
];

const DEFAULT_PROPFIND_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getlastmodified/>
    <d:getetag/>
    <d:getcontentlength/>
    <d:getcontenttype/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

export class NextcloudConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NextcloudConfigError";
  }
}

export type NextcloudSettings = {
  webdavBaseUrl: string;
  username: string;
  password: string;
  ragFolder: string;
  timeoutMs: number;
  publicBaseUrl?: string;
};

export type NextcloudLibraryEntry = {
  path: string;
  name: string;
  isFolder: boolean;
  size?: number;
  etag?: string;
  contentType?: string;
  lastModified?: number;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readEnvAny(...names: string[]): string | undefined {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }
  return undefined;
}

function ensureConfigured() {
  const missing = REQUIRED_ENV_GROUPS.filter(
    (group) => !readEnvAny(...group),
  ).map((group) => group.join(" / "));
  if (missing.length > 0) {
    throw new NextcloudConfigError(
      `Nextcloud WebDAV の設定 (${missing.join(
        ", ",
      )}) が未設定です。`,
    );
  }
}

export function isNextcloudConfigured(): boolean {
  try {
    ensureConfigured();
    return true;
  } catch (error) {
    if (error instanceof NextcloudConfigError) {
      return false;
    }
    throw error;
  }
}

export function getNextcloudSettings(): NextcloudSettings {
  ensureConfigured();
  const base = readEnv("NEXTCLOUD_WEBDAV_BASE_URL")!;
  const ragFolder = readEnv("NEXTCLOUD_RAG_FOLDER") || "/RAG";
  const timeoutMs = Number(readEnv("NEXTCLOUD_TIMEOUT_MS")) || 60000;
  return {
    webdavBaseUrl: base.replace(/\/+$/, ""),
    username: readEnvAny("NEXTCLOUD_USERNAME", "NEXTCLOUD_WEBDAV_USERNAME")!,
    password: readEnvAny(
      "NEXTCLOUD_APP_PASSWORD",
      "NEXTCLOUD_WEBDAV_PASSWORD",
    )!,
    ragFolder: normalizeFolder(ragFolder),
    timeoutMs: timeoutMs > 0 ? timeoutMs : 60000,
    publicBaseUrl: readEnv("NEXTCLOUD_PUBLIC_BASE_URL"),
  };
}

function normalizeFolder(folder: string) {
  const raw = folder.trim();
  if (!raw) return "/";
  const normalized = `/${raw.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  if (normalized === "//") return "/";
  return normalized;
}

function sanitizeSegment(segment: string) {
  return segment
    .replace(/\\/g, "")
    .replace(/\s+/g, " ")
    .replace(/["'<>|]/g, "")
    .trim();
}

function encodePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function normalizeNextcloudPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  const segments = trimmed.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) return "/";
  return `/${segments.join("/")}`;
}

export function resolveNotebookFolderPath(
  notebookId: string,
  overridePath?: string | null,
  settings: NextcloudSettings = getNextcloudSettings(),
): string {
  if (overridePath && overridePath.trim()) {
    return normalizeNextcloudPath(overridePath);
  }
  const safeId = sanitizeSegment(notebookId) || notebookId;
  return normalizeNextcloudPath(`${settings.ragFolder}/${safeId}`);
}

function buildWebDavUrl(path: string, settings: NextcloudSettings) {
  const encoded = encodePath(normalizeNextcloudPath(path));
  return `${settings.webdavBaseUrl}/${encoded}`;
}

function buildAuthHeader(settings: NextcloudSettings) {
  const token = Buffer.from(
    `${settings.username}:${settings.password}`,
    "utf-8",
  ).toString("base64");
  return `Basic ${token}`;
}

async function requestNextcloud(
  path: string,
  init: RequestInit,
  settings: NextcloudSettings,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const response = await fetch(buildWebDavUrl(path, settings), {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: buildAuthHeader(settings),
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Nextcloud API ${response.status}: ${text || response.statusText}`,
      );
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function propfind(
  path: string,
  settings: NextcloudSettings,
  depth: "0" | "1" | "infinity" = "1",
) {
  const response = await requestNextcloud(
    path,
    {
      method: "PROPFIND",
      headers: {
        Depth: depth,
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: DEFAULT_PROPFIND_BODY,
    },
    settings,
  );
  return response.text();
}

function stripBaseFromHref(href: string, settings: NextcloudSettings) {
  const normalized = href.replace(/^https?:\/\//i, "");
  const slashIndex = normalized.indexOf("/");
  if (slashIndex === -1) return normalizeNextcloudPath(`/${normalized}`);
  const pathPart = normalized.slice(slashIndex);
  const base = new URL(settings.webdavBaseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  const candidate = pathPart.startsWith(basePath)
    ? pathPart.slice(basePath.length) || "/"
    : pathPart;
  return normalizeNextcloudPath(candidate);
}

function parsePropfindResponse(
  xml: string,
  basePath: string,
  settings: NextcloudSettings,
): NextcloudLibraryEntry[] {
  const parsed = xmlParser.parse(xml);
  const responses = parsed?.multistatus?.response;
  if (!responses) return [];
  const list = Array.isArray(responses) ? responses : [responses];
  const normalizedBase = normalizeNextcloudPath(basePath);
  const entries: NextcloudLibraryEntry[] = [];
  list.forEach((response: any) => {
    const href: string | undefined = response?.href;
    if (!href) return;
    const decoded = decodeURIComponent(href);
    const relativePath = normalizeNextcloudPath(
      stripBaseFromHref(decoded, settings) || "/",
    );
    const propstat = response?.propstat;
    const propsRaw = Array.isArray(propstat)
      ? propstat.find((item) => String(item?.status || "").includes("200"))?.prop
      : propstat?.prop;
    const props = propsRaw || {};
    const resourcetype = props?.resourcetype || {};
    const isCollection = Boolean(resourcetype?.collection);
    const entry: NextcloudLibraryEntry = {
      path: relativePath,
      name: relativePath.split("/").filter(Boolean).pop() || "/",
      isFolder: isCollection,
    };
    if (props?.getcontentlength != null) {
      const sizeValue = Number(props.getcontentlength);
      if (!Number.isNaN(sizeValue)) entry.size = sizeValue;
    }
    if (typeof props?.getcontenttype === "string") {
      entry.contentType = props.getcontenttype;
    }
    if (typeof props?.getlastmodified === "string") {
      const ts = Date.parse(props.getlastmodified);
      if (!Number.isNaN(ts)) entry.lastModified = ts;
    }
    if (typeof props?.getetag === "string") {
      entry.etag = props.getetag.replace(/"/g, "");
    }
    entries.push(entry);
  });
  return entries.filter((entry) => entry.path !== normalizedBase);
}

export async function ensureNextcloudFolder(
  folderPath: string,
  settings: NextcloudSettings = getNextcloudSettings(),
) {
  const normalized = normalizeNextcloudPath(folderPath);
  const segments = normalized.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = `${current}/${segment}`;
    try {
      await requestNextcloud(current, { method: "MKCOL" }, settings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("405")) {
        continue;
      }
      if (message.includes("409")) {
        continue;
      }
      throw error;
    }
  }
  return normalizeNextcloudPath(current || "/");
}

export async function uploadToNextcloud(
  file: File,
  targetPath: string,
  settings: NextcloudSettings = getNextcloudSettings(),
) {
  const normalized = normalizeNextcloudPath(targetPath);
  const parent = normalized.split("/").slice(0, -1).join("/") || "/";
  await ensureNextcloudFolder(parent, settings);
  const response = await requestNextcloud(
    normalized,
    {
      method: "PUT",
      body: file.stream(),
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
    },
    settings,
  );
  return {
    path: normalized,
    etag: response.headers.get("etag"),
  };
}

export async function listNextcloudFolderEntries(
  folderPath: string,
  options: { foldersOnly?: boolean } = {},
) {
  const settings = getNextcloudSettings();
  const normalized = normalizeNextcloudPath(folderPath || "/");
  const xml = await propfind(normalized, settings, "1");
  let entries = parsePropfindResponse(xml, normalized, settings);
  if (options.foldersOnly) {
    entries = entries.filter((entry) => entry.isFolder);
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function collectNextcloudFiles(
  folderPath: string,
  options: { maxFiles?: number } = {},
) {
  const maxFiles = options.maxFiles ?? 200;
  const bucket: NextcloudLibraryEntry[] = [];
  const settings = getNextcloudSettings();
  const normalized = normalizeNextcloudPath(folderPath || "/");

  async function walk(path: string) {
    if (bucket.length >= maxFiles) return;
    const xml = await propfind(path, settings, "1");
    const entries = parsePropfindResponse(xml, path, settings);
    for (const entry of entries) {
      if (bucket.length >= maxFiles) break;
      if (entry.isFolder) {
        await walk(entry.path);
      } else {
        bucket.push(entry);
      }
    }
  }

  await walk(normalized);
  return bucket;
}

export async function triggerIngestFromNextcloud(
  scope: BackendScope,
  nextcloudPath: string,
) {
  const RAG_BASE =
    process.env.RAG_SERVER_URL ||
    process.env.RAG_API_BASE ||
    process.env.RAG_BASE_URL ||
    "http://127.0.0.1:3002";
  const API_KEY = process.env.RAG_API_KEY || process.env.API_KEY || "";
  const payload = {
    tenant: scope.tenant,
    user_id: scope.user_id,
    notebook_id: scope.notebook_id,
    include_global: scope.include_global,
    path: nextcloudPath,
  };
  const response = await fetch(
    `${RAG_BASE.replace(/\/$/, "")}/ingest/from-nextcloud`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant": scope.tenant,
        "x-user-id": scope.user_id,
        "x-notebook-id": scope.notebook_id,
        ...(API_KEY
          ? { Authorization: `Bearer ${API_KEY}`, "x-api-key": API_KEY }
          : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `RAG backend ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export function buildNextcloudAppUrl(
  path: string,
  settings: NextcloudSettings = getNextcloudSettings(),
) {
  const normalized = normalizeNextcloudPath(path);
  const base = settings.publicBaseUrl || derivePublicBase(settings.webdavBaseUrl);
  const url = new URL("/apps/files/", base);
  url.searchParams.set("dir", normalized);
  return url.toString();
}

function derivePublicBase(webdavBase: string) {
  try {
    const parsed = new URL(webdavBase);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return webdavBase;
  }
}
