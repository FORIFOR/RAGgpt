"use client";

import clsx from "clsx";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
} from "react";
import { toast } from "sonner";

import { Layout } from "@/components/Layout";
import { LibraryPickerModal } from "@/components/notebook/LibraryPickerModal";
import { linkLibraryItemsToNotebook, uploadFileToNotebook } from "@/lib/api";
import { normalizeNextcloudPath } from "@/lib/nextcloud";
import { saveNotebookMeta } from "@/lib/notebookMeta";
import { DEFAULT_TENANT, DEFAULT_USER, scopeOf, setScope } from "@/lib/scope";

type InitialUpload = {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

type LibrarySearchHit = {
  id: string;
  path: string;
  title: string;
  snippet?: string;
  contentType?: string;
  size?: number;
  updatedAt?: number;
  tags?: string[];
};

type LinkedFolder = {
  path: string;
  isPrimary: boolean;
};

type ResourceTab = "search" | "upload" | "folder";
type LibraryTypeFilter = "all" | "pdf" | "office" | "text";
type TimeRange = "any" | "week" | "month";

const DEFAULT_BASE_FOLDER =
  process.env.NEXT_PUBLIC_NEXTCLOUD_RAG_FOLDER?.trim() || "/RAG";
const NEXTCLOUD_FILES_BASE =
  process.env.NEXT_PUBLIC_NEXTCLOUD_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_NEXTCLOUD_BASE_URL ||
  "";

const RESOURCE_TABS: Array<{ key: ResourceTab; label: string }> = [
  { key: "search", label: "社内ライブラリ検索" },
  { key: "upload", label: "ローカルからアップロード" },
  { key: "folder", label: "Nextcloudフォルダを紐付け" },
];

export default function NewKnowledgeBasePage() {
  const router = useRouter();
  const [identity, setIdentity] = useState({
    tenant: DEFAULT_TENANT,
    user: DEFAULT_USER,
  });
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [folderSlug, setFolderSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [nextcloudLink, setNextcloudLink] = useState("");
  const [initialUploads, setInitialUploads] = useState<InitialUpload[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [linkedFolders, setLinkedFolders] = useState<LinkedFolder[]>([]);
  const [sourceTab, setSourceTab] = useState<ResourceTab>("search");
  const [libraryResults, setLibraryResults] = useState<LibrarySearchHit[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryType, setLibraryType] =
    useState<LibraryTypeFilter>("all");
  const [libraryRange, setLibraryRange] = useState<TimeRange>("any");
  const [libraryPathFilter, setLibraryPathFilter] = useState("");
  const [selectedLibraryFiles, setSelectedLibraryFiles] = useState<
    LibrarySearchHit[]
  >([]);
  const [selectedLibraryPaths, setSelectedLibraryPaths] = useState<
    Record<string, boolean>
  >({});
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [nextcloudReady, setNextcloudReady] = useState<boolean | null>(null);
  const [nextcloudError, setNextcloudError] = useState<string | null>(null);
  const [notebookId] = useState(() => `nb_${nanoid(8)}`);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tenant =
      window.sessionStorage.getItem("tenant")?.trim() || DEFAULT_TENANT;
    const user =
      window.sessionStorage.getItem("user_id")?.trim() || DEFAULT_USER;
    setIdentity({ tenant, user });
  }, []);

  useEffect(() => {
    if (folderSlug || slugTouched) return;
    setFolderSlug(slugify(name));
  }, [name, folderSlug, slugTouched]);

  useEffect(() => {
    let active = true;
    fetch("/api/backend/nextcloud/status")
      .then((response) => response.json())
      .then((payload: { ok?: boolean; error?: string }) => {
        if (!active) return;
        setNextcloudReady(Boolean(payload.ok));
        if (!payload.ok) {
          setNextcloudError(payload.error || "Nextcloud の設定が見つかりません");
        } else {
          setNextcloudError(null);
        }
      })
      .catch((error) => {
        if (!active) return;
        setNextcloudReady(false);
        setNextcloudError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, []);

  const normalizedSlug = useMemo(
    () => slugify(folderSlug || name || notebookId),
    [folderSlug, name, notebookId],
  );

  const suggestedFolderPath = useMemo(
    () => normalizeFolder(`${DEFAULT_BASE_FOLDER}/${normalizedSlug}`),
    [normalizedSlug],
  );

  const primaryFolderPath = useMemo(() => {
    const primary = linkedFolders.find((item) => item.isPrimary);
    return primary ? primary.path : "";
  }, [linkedFolders]);

  const resolvedFolderPath =
    primaryFolderPath || suggestedFolderPath || DEFAULT_BASE_FOLDER;

  const addFolderLink = useCallback(
    (path: string, options?: { primary?: boolean }) => {
      const normalized = normalizeFolder(path);
      setLinkedFolders((prev) => {
        if (prev.some((folder) => folder.path === normalized)) {
          return options?.primary
            ? prev.map((folder) => ({
                ...folder,
                isPrimary: folder.path === normalized,
              }))
            : prev;
        }
        const next = prev.map((folder) =>
          options?.primary
            ? { ...folder, isPrimary: false }
            : folder,
        );
        return [
          ...next,
          { path: normalized, isPrimary: options?.primary ?? !next.length },
        ];
      });
    },
    [],
  );

  const handleFolderRemoval = useCallback((path: string) => {
    setLinkedFolders((prev) => {
      const filtered = prev.filter((folder) => folder.path !== path);
      if (!filtered.length) return filtered;
      if (!filtered.some((folder) => folder.isPrimary)) {
        filtered[0] = { ...filtered[0], isPrimary: true };
      }
      return filtered;
    });
  }, []);

  const handlePrimaryToggle = useCallback((path: string) => {
    setLinkedFolders((prev) =>
      prev.map((folder) => ({
        ...folder,
        isPrimary: folder.path === path,
      })),
    );
  }, []);

  const addTag = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setTags((prev) => {
        if (prev.includes(trimmed)) return prev;
        return [...prev, trimmed];
      });
      setTagInput("");
    },
    [],
  );

  const handleTagInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addTag(tagInput);
      }
    },
    [addTag, tagInput],
  );

  const handleTagInputBlur = useCallback(() => {
    addTag(tagInput);
  }, [addTag, tagInput]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files);
    setInitialUploads((prev) => {
      const existing = new Set(prev.map((item) => item.file.name));
      const additions = list.filter(
        (file) => !existing.has(file.name),
      );
      if (!additions.length) return prev;
      return [
        ...prev,
        ...additions.map((file) => ({
          id: `${Date.now()}-${file.name}`,
          file,
          status: "pending" as const,
        })),
      ];
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setInitialUploads((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      if (nextcloudReady === false) {
        toast.error("Nextcloud が未設定のため、アップロードできません。");
        return;
      }
      if (event.dataTransfer?.files) {
        handleFiles(event.dataTransfer.files);
      }
    },
    [handleFiles, nextcloudReady],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (nextcloudReady === false) return;
      setDragActive(true);
    },
    [nextcloudReady],
  );

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
  }, []);

  const handleFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
        handleFiles(event.target.files);
      }
      event.target.value = "";
    },
    [handleFiles],
  );

  const performLibrarySearch = useCallback(async () => {
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setLibraryLoading(true);
    setLibraryError(null);
    const params = new URLSearchParams();
    if (libraryQuery.trim()) params.set("q", libraryQuery.trim());
    if (libraryPathFilter.trim()) {
      params.set("path_prefix", libraryPathFilter.trim());
    }
    if (libraryType !== "all") params.set("type", libraryType);
    const updatedAfter = resolveSince(libraryRange);
    if (updatedAfter) params.set("updated_after", updatedAfter);
    try {
      const response = await fetch(
        `/api/library/search?${params.toString()}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({} as Record<string, string>));
        throw new Error(
          payload?.detail ||
            payload?.error ||
            `HTTP ${response.status}`,
        );
      }
      const payload = (await response.json()) as {
        items?: LibrarySearchHit[];
      };
      setLibraryResults(payload.items || []);
    } catch (error) {
      if ((error as any)?.name === "AbortError") return;
      const message =
        error instanceof Error ? error.message : String(error);
      setLibraryError(message);
      setLibraryResults([]);
    } finally {
      setLibraryLoading(false);
    }
  }, [libraryPathFilter, libraryQuery, libraryRange, libraryType]);

  useEffect(() => {
    if (!libraryQuery && !libraryPathFilter) return;
    const timer = setTimeout(() => {
      void performLibrarySearch();
    }, 350);
    return () => clearTimeout(timer);
  }, [performLibrarySearch, libraryPathFilter, libraryQuery]);

  const handleAddLibrarySelections = useCallback(() => {
    const picks = libraryResults.filter(
      (hit) => selectedLibraryPaths[hit.path],
    );
    if (!picks.length) {
      toast.error("資料を選択してください");
      return;
    }
    setSelectedLibraryFiles((prev) => {
      const existing = new Set(prev.map((item) => item.path));
      const merged = [...prev];
      for (const item of picks) {
        if (!existing.has(item.path)) {
          merged.push(item);
        }
      }
      return merged;
    });
    setSelectedLibraryPaths({});
    toast.success(`${picks.length} 件の資料を追加しました`);
  }, [libraryResults, selectedLibraryPaths]);

  const handleRemoveLibraryFile = useCallback((path: string) => {
    setSelectedLibraryFiles((prev) =>
      prev.filter((item) => item.path !== path),
    );
  }, []);

  const summaryItemsCount =
    selectedLibraryFiles.length +
    initialUploads.length +
    linkedFolders.length;

  const canProceedToStep2 = Boolean(name.trim());
  const canCreate = canProceedToStep2 && !isCreating;

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      toast.error("Notebook 名を入力してください");
      return;
    }
    const trimmedDescription = description.trim();
    const normalizedPath = resolvedFolderPath
      ? normalizeNextcloudPath(resolvedFolderPath)
      : undefined;
    const meta = {
      title: name.trim(),
      description: trimmedDescription,
      nextcloudPath: normalizedPath,
      nextcloudUrl: nextcloudLink.trim(),
      tags,
      updatedAt: Date.now(),
    };

    saveNotebookMeta(notebookId, meta);
    const scope = scopeOf(notebookId, {
      tenant: identity.tenant,
      user_id: identity.user,
      include_global: false,
    });
    setScope(scope);
    setIsCreating(true);
    let hasUploadError = false;

    try {
      for (const item of initialUploads) {
        setInitialUploads((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "uploading", error: undefined }
              : entry,
          ),
        );
        try {
          await uploadFileToNotebook(notebookId, item.file, {
            folderPath: normalizedPath,
          });
          setInitialUploads((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: "done" }
                : entry,
            ),
          );
        } catch (error) {
          console.error(error);
          hasUploadError = true;
          setInitialUploads((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: "error",
                    error:
                      error instanceof Error
                        ? error.message
                        : "アップロードに失敗しました",
                  }
                : entry,
            ),
          );
        }
      }

      const linkItems = [
        ...selectedLibraryFiles.map((item) => ({
          path: item.path,
          type: "file" as const,
        })),
        ...linkedFolders.map((folder) => ({
          path: folder.path,
          type: "folder" as const,
        })),
      ];

      if (linkItems.length) {
        try {
          await linkLibraryItemsToNotebook(notebookId, linkItems);
        } catch (error) {
          console.error(error);
          toast.error("ライブラリ資料の紐付けに失敗しました");
        }
      }

      if (hasUploadError) {
        toast.error(
          "一部のファイルはアップロードできませんでした。Notebook 画面で再試行してください。",
        );
      } else if (initialUploads.length > 0) {
        toast.success("初期ファイルをアップロードしました");
      }
      toast.success("Notebook を作成しました");
      router.push(`/n/${encodeURIComponent(notebookId)}`);
    } catch (error) {
      console.error(error);
      toast.error("Notebook の作成に失敗しました");
    } finally {
      setIsCreating(false);
    }
  }, [
    description,
    identity.tenant,
    identity.user,
    initialUploads,
    linkedFolders,
    name,
    nextcloudLink,
    notebookId,
    resolvedFolderPath,
    router,
    selectedLibraryFiles,
    tags,
  ]);

  const selectedCount = useMemo(
    () =>
      Object.values(selectedLibraryPaths).filter(Boolean)
        .length,
    [selectedLibraryPaths],
  );

  const libraryScopeLabel =
    libraryPathFilter || "/Knowledge 以下（全件）";

  const handleFolderFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const value = formData.get("folderPath");
      if (typeof value !== "string" || !value.trim()) return;
      addFolderLink(value, { primary: !linkedFolders.length });
      event.currentTarget.reset();
    },
    [addFolderLink, linkedFolders.length],
  );

  const summaryUploads = initialUploads.map((upload) => ({
    id: upload.id,
    title: upload.file.name,
    subtitle: "ローカルアップロード",
    status: upload.status,
    size: upload.file.size,
    error: upload.error,
  }));

  const summaryLibraryRows = selectedLibraryFiles.map((doc) => ({
    id: `lib-${doc.path}`,
    doc,
  }));

  const summaryFolders = linkedFolders.map((folder) => ({
    path: folder.path,
    isPrimary: folder.isPrimary,
  }));

  const showLibrarySearchCta =
    !libraryQuery.trim() && !libraryPathFilter.trim();
  const uploadsDisabled = nextcloudReady === false;

  return (
    <Layout>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">
            Notebook Wizard
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-900">
            Notebook を作成
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Step1 で Notebook の基本情報を設定し、Step2 で AI が扱う資料セットを組み立てます。Nextcloud
            / Elasticsearch / Borg の保護下で安全に運用できます。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {[1, 2].map((step) => (
            <button
              key={step}
              type="button"
              onClick={() =>
                setCurrentStep(step === 1 || canProceedToStep2 ? (step as 1 | 2) : currentStep)
              }
              className={clsx(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
                currentStep === step
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 shadow-sm",
                step === 2 && !canProceedToStep2
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer",
              )}
              disabled={step === 2 && !canProceedToStep2}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs">
                {step}
              </span>
              {step === 1 ? "基本情報" : "資料セット"}
            </button>
          ))}
        </div>

        {currentStep === 1 ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">
              STEP 1
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              Notebook の基本情報
            </h2>
            <div className="mt-6 space-y-5">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Notebook 名
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-base shadow-inner"
                  placeholder="案件A、社内規程、補助金調査 など"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  説明 (任意)
                </label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-base shadow-inner"
                  rows={3}
                  placeholder="Notebook の目的や扱う資料の範囲"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">
                  タグ
                </label>
                <div className="mt-1 flex flex-wrap gap-2 rounded-xl border border-slate-200 px-3 py-2 shadow-inner">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() =>
                          setTags((prev) => prev.filter((t) => t !== tag))
                        }
                        className="text-slate-400 hover:text-rose-500"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    onBlur={handleTagInputBlur}
                    placeholder="Enter で追加"
                    className="flex-1 min-w-[160px] border-none bg-transparent text-sm outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                disabled={!canProceedToStep2}
                className="rounded-full bg-slate-900 px-6 py-2.5 text-white shadow disabled:opacity-40"
              >
                次へ（資料を選ぶ）
              </button>
            </div>
          </section>
        ) : null}

        {currentStep === 2 ? (
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-500">
                    STEP 2
                  </p>
                  <h2 className="text-2xl font-semibold text-slate-900">
                    AI が扱う資料セット
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    選択済み資料: {summaryItemsCount} 件 / Nextcloud
                    フォルダ: {linkedFolders.length || 1}{" "}
                    （既定: {resolvedFolderPath}）
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  🧠 = AI インデックス / 🗃️ = Nextcloud Versions ・ Borg
                </div>
              </div>
              {uploadsDisabled ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Nextcloud の接続設定 (NEXTCLOUD_WEBDAV_*) が未設定のため、アップロードやフォルダ紐付けは無効化されています。
                  管理者が環境変数を設定すると自動的に有効になります。
                  {nextcloudError ? <div className="mt-1 text-xs">{nextcloudError}</div> : null}
                </div>
              ) : null}
              <div className="mt-5 space-y-3">
                {summaryLibraryRows.map(({ id, doc }) => (
                  <SummaryCard
                    key={id}
                    title={doc.title}
                    subtitle={doc.path}
                    badges={[
                      { icon: "🧠", label: "Elasticsearch / RAG 済" },
                      { icon: "🗃️", label: "Versions / Borg" },
                    ]}
                    meta={[
                      doc.size ? formatBytes(doc.size) : undefined,
                      doc.updatedAt
                        ? `更新: ${formatDate(doc.updatedAt)}`
                        : undefined,
                      doc.contentType,
                    ]}
                    snippet={doc.snippet}
                    actions={
                      <div className="flex gap-2">
                        {buildNextcloudFilesUrl(doc.path) ? (
                          <a
                            href={buildNextcloudFilesUrl(doc.path)}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            Nextcloud
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleRemoveLibraryFile(doc.path)}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                        >
                          除外
                        </button>
                      </div>
                    }
                  />
                ))}
                {summaryUploads.map((upload) => (
                  <SummaryCard
                    key={upload.id}
                    title={upload.title}
                    subtitle="ローカルアップロード"
                    badges={[
                      {
                        icon: "🧠",
                        label:
                          upload.status === "done"
                            ? "RAG キュー済"
                            : upload.status === "uploading"
                              ? "アップロード中"
                              : upload.status === "error"
                                ? "失敗"
                                : "待機中",
                      },
                      {
                        icon: "🗃️",
                        label: resolvedFolderPath
                          ? `Nextcloud ${resolvedFolderPath}`
                          : "Nextcloud 未設定",
                      },
                    ]}
                    meta={[
                      formatBytes(upload.size),
                      upload.status === "error"
                        ? upload.error
                        : undefined,
                    ]}
                    actions={
                      upload.status === "pending" ? (
                        <button
                          type="button"
                          onClick={() => removeFile(upload.id)}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                        >
                          削除
                        </button>
                      ) : null
                    }
                  />
                ))}
                {summaryFolders.map((folder) => (
                  <SummaryCard
                    key={folder.path}
                    title={folder.path}
                    subtitle={
                      folder.isPrimary
                        ? "Nextcloud フォルダ（既定）"
                        : "Nextcloud フォルダ"
                    }
                    badges={[
                      { icon: "🧠", label: "フォルダ監視対象" },
                      { icon: "🗃️", label: "Versions / Borg" },
                    ]}
                    actions={
                      <div className="flex gap-2">
                        {!folder.isPrimary ? (
                          <button
                            type="button"
                            onClick={() => handlePrimaryToggle(folder.path)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            既定にする
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleFolderRemoval(folder.path)}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                        >
                          解除
                        </button>
                      </div>
                    }
                  />
                ))}
                {!summaryItemsCount ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    まだ資料は追加されていません。下のタブから社内ライブラリ検索 / アップロード / フォルダ紐付けを行ってください。
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                {RESOURCE_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setSourceTab(tab.key)}
                    className={clsx(
                      "rounded-full px-4 py-1.5 text-sm font-semibold transition",
                      sourceTab === tab.key
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-600",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="pt-4">
                {sourceTab === "search" ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row">
                      <input
                        type="search"
                        value={libraryQuery}
                        onChange={(event) =>
                          setLibraryQuery(event.target.value)
                        }
                        className="flex-1 rounded-2xl border border-slate-200 px-4 py-2 text-base shadow-inner"
                        placeholder="社内資料を検索（タイトル・本文・タグ）"
                      />
                      <div className="flex gap-2 text-sm">
                        <select
                          value={libraryType}
                          onChange={(event) =>
                            setLibraryType(
                              event.target.value as LibraryTypeFilter,
                            )
                          }
                          className="rounded-xl border border-slate-200 px-3 py-2"
                        >
                          <option value="all">ファイル種別: すべて</option>
                          <option value="pdf">PDF</option>
                          <option value="office">Office</option>
                          <option value="text">テキスト</option>
                        </select>
                        <select
                          value={libraryRange}
                          onChange={(event) =>
                            setLibraryRange(
                              event.target.value as TimeRange,
                            )
                          }
                          className="rounded-xl border border-slate-200 px-3 py-2"
                        >
                          <option value="any">更新日: 全期間</option>
                          <option value="week">直近 1 週間</option>
                          <option value="month">直近 1 か月</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 md:flex-row">
                      <input
                        type="text"
                        value={libraryPathFilter}
                        onChange={(event) =>
                          setLibraryPathFilter(event.target.value)
                        }
                        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="パスで絞り込み（例: /Knowledge/プロジェクトA）"
                      />
                      <button
                        type="button"
                        onClick={() => void performLibrarySearch()}
                        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow"
                      >
                        再検索
                      </button>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500">
                      {libraryScopeLabel}
                    </div>
                    <div className="space-y-3">
                      {libraryLoading ? (
                        <div className="rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-500">
                          検索中…
                        </div>
                      ) : libraryError ? (
                        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">
                          ライブラリ検索に失敗しました: {libraryError}
                        </div>
                      ) : showLibrarySearchCta ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                          検索キーワードまたはパスを入力して社内資料を探します。
                        </div>
                      ) : libraryResults.length === 0 ? (
                        <div className="rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-500">
                          該当する資料は見つかりませんでした。
                        </div>
                      ) : (
                        <ul className="space-y-3">
                          {libraryResults.map((hit) => (
                            <li
                              key={hit.id}
                              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={!!selectedLibraryPaths[hit.path]}
                                  onChange={() =>
                                    setSelectedLibraryPaths((prev) => ({
                                      ...prev,
                                      [hit.path]: !prev[hit.path],
                                    }))
                                  }
                                  className="mt-1"
                                />
                                <div className="flex-1">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="font-semibold text-slate-900">
                                        {hit.title}
                                      </p>
                                      <p className="text-xs text-slate-500">
                                        {hit.path}
                                      </p>
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {hit.updatedAt
                                        ? formatDate(hit.updatedAt)
                                        : null}
                                    </div>
                                  </div>
                                  {hit.snippet ? (
                                    <p
                                      className="mt-2 text-sm text-slate-600"
                                      dangerouslySetInnerHTML={{
                                        __html: hit.snippet,
                                      }}
                                    />
                                  ) : null}
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    {hit.contentType ? (
                                      <span>{hit.contentType}</span>
                                    ) : null}
                                    {hit.size ? (
                                      <span>{formatBytes(hit.size)}</span>
                                    ) : null}
                                    {hit.tags?.length ? (
                                      <span>
                                        Tags: {hit.tags.join(", ")}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-sm text-slate-500">
                      <span>{selectedCount} 件選択中</span>
                      <button
                        type="button"
                        onClick={handleAddLibrarySelections}
                        disabled={selectedCount === 0}
                        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        この Notebook に追加
                      </button>
                    </div>
                  </div>
                ) : null}

                {sourceTab === "upload" ? (
                  <div className="space-y-4">
                    <div
                      className={`rounded-2xl border border-dashed p-6 text-center ${
                        dragActive
                          ? "border-sky-400 bg-sky-50"
                          : "border-slate-300 bg-slate-50"
                      }`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        id="initial-upload"
                        onChange={handleFileInput}
                        disabled={uploadsDisabled}
                      />
                      <label
                        htmlFor="initial-upload"
                        className={`inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 ${
                          uploadsDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                        }`}
                      >
                        ファイルを選択
                      </label>
                      <p className="mt-2 text-xs text-slate-500">
                        {resolvedFolderPath
                          ? `Nextcloud ${resolvedFolderPath} に保存され、Assistant / RAG の対象になります。`
                          : "Nextcloud フォルダを設定すると、自動的に同期されます。"}
                      </p>
                      {uploadsDisabled ? (
                        <p className="mt-2 text-xs text-rose-600">
                          Nextcloud の接続設定が未完了のため、アップロードはできません。
                        </p>
                      ) : null}
                    </div>
                    {initialUploads.length ? (
                      <ul className="space-y-2">
                        {initialUploads.map((upload) => (
                          <li
                            key={upload.id}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-800">
                                {upload.file.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {formatBytes(upload.file.size)} ・{" "}
                                {upload.status === "pending" &&
                                  "アップロード待ち"}
                                {upload.status === "uploading" &&
                                  "アップロード中"}
                                {upload.status === "done" && "完了"}
                                {upload.status === "error" &&
                                  upload.error}
                              </p>
                            </div>
                            {upload.status === "pending" ? (
                              <button
                                type="button"
                                onClick={() => removeFile(upload.id)}
                                className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-rose-300 hover:text-rose-600"
                              >
                                削除
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {sourceTab === "folder" ? (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-700">
                        推奨フォルダ
                      </p>
                      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-inner">
                          <div className="flex items-center justify-between px-4 py-2 text-sm text-slate-700">
                            <span>
                              {normalizeFolder(
                                `${DEFAULT_BASE_FOLDER}/${normalizedSlug}`,
                              )}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            addFolderLink(suggestedFolderPath, {
                              primary: true,
                            })
                          }
                          className={`rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white ${
                            uploadsDisabled ? "cursor-not-allowed opacity-50" : ""
                          }`}
                          disabled={uploadsDisabled}
                        >
                          既定に設定
                        </button>
                      </div>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          value={folderSlug}
                          onChange={(event) => {
                            setFolderSlug(event.target.value);
                            setSlugTouched(true);
                          }}
                          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-inner"
                          placeholder="フォルダ識別子（例: notebook-a）"
                        />
                      </div>
                    </div>

                    <form
                      onSubmit={handleFolderFormSubmit}
                      className="flex flex-col gap-3 md:flex-row"
                    >
                        <input
                          type="text"
                          name="folderPath"
                          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-inner"
                          placeholder="/Knowledge/プロジェクトA/議事録"
                          disabled={uploadsDisabled}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setLibraryPickerOpen(true)}
                            className={`rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-white ${
                              uploadsDisabled ? "cursor-not-allowed opacity-50" : ""
                            }`}
                            disabled={uploadsDisabled}
                          >
                            Browse…
                          </button>
                          <button
                            type="submit"
                            className={`rounded-full px-4 py-2 text-sm font-semibold text-white ${
                              uploadsDisabled ? "cursor-not-allowed bg-slate-400" : "bg-slate-900"
                            }`}
                            disabled={uploadsDisabled}
                          >
                            フォルダを追加
                          </button>
                        </div>
                      </form>

                    <div className="space-y-3">
                      <label className="text-sm font-medium text-slate-700">
                        Nextcloud で開くリンク (任意)
                      </label>
                      <input
                        type="url"
                        value={nextcloudLink}
                        onChange={(event) =>
                          setNextcloudLink(event.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm shadow-inner"
                        placeholder="https://cloud.example.jp/apps/files/?dir=/RAG/案件A"
                        disabled={uploadsDisabled}
                      />
                    </div>

                    {!linkedFolders.length ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                        フォルダを追加すると、新しいファイルが自動的に Notebook に連携されます。Nextcloud
                        バージョン管理 / Borg の保護対象にも反映されます。
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-3">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="rounded-full border border-slate-200 px-5 py-2 text-sm text-slate-600 hover:bg-white"
              >
                戻る
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!canCreate}
                className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow disabled:opacity-40"
              >
                {isCreating ? "作成中…" : "Notebook を作成"}
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <LibraryPickerModal
        open={libraryPickerOpen}
        mode="folder"
        initialPath={resolvedFolderPath}
        onClose={() => setLibraryPickerOpen(false)}
        onConfirm={(selection) => {
          if (selection.folder) {
            addFolderLink(selection.folder, {
              primary: !linkedFolders.length,
            });
          }
          setLibraryPickerOpen(false);
        }}
      />
    </Layout>
  );
}

type SummaryCardProps = {
  title: string;
  subtitle: string;
  badges: Array<{ icon: string; label: string }>;
  meta?: Array<string | undefined>;
  snippet?: string;
  actions?: ReactNode;
};

function SummaryCard({
  title,
  subtitle,
  badges,
  meta,
  snippet,
  actions,
}: SummaryCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        {actions}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
        {badges.map((badge, index) => (
          <span
            key={`${badge.icon}-${index}`}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"
          >
            {badge.icon} {badge.label}
          </span>
        ))}
      </div>
      {snippet ? (
        <p
          className="mt-3 text-sm text-slate-600"
          dangerouslySetInnerHTML={{ __html: snippet }}
        />
      ) : null}
      {meta?.filter(Boolean).length ? (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
          {meta.filter(Boolean).map((item, index) => (
            <Fragment key={`${item}-${index}`}>{item}</Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeFolder(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return normalized.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function resolveSince(range: TimeRange) {
  if (range === "week") {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === "month") {
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  return "";
}

function formatDate(value: number) {
  const date = new Date(value);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildNextcloudFilesUrl(path: string) {
  if (!NEXTCLOUD_FILES_BASE) return "";
  const base = NEXTCLOUD_FILES_BASE.replace(/\/+$/, "");
  const encoded = encodeURIComponent(normalizeNextcloudPath(path));
  return `${base}/apps/files/?dir=${encoded}`;
}
