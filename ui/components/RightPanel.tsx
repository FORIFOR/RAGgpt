"use client";
import React from "react";
import { useProfile } from "../lib/profile";
import { useAccessibility } from "./AccessibilityProvider";

export function RightPanel({
  tab,
  setTab,
  citations,
  sources,
  usage,
  docUsage,
  onToggleSource,
  onDeleteSource,
  notes,
  onAddNote,
  onToggleNote,
  onPickFiles,
  uploads,
  onOpenCitation,
}: {
  tab: "citations" | "sources" | "notes" | "settings";
  setTab: (t: any) => void;
  citations: any[];
  sources: any[];
  usage?: { approxBytes: number; totalBytesAll: number; percentOfAll: number; capacityBytes?: number|null; percentOfCapacity?: number|null } | null;
  docUsage?: Record<string, { count: number; lastAt: number; pages: number[] }>;
  onToggleSource: (id: string, enabled: boolean) => void;
  onDeleteSource: (id: string) => void;
  notes: { id: string; text: string; done?: boolean; createdAt: number }[];
  onAddNote: (text: string) => void;
  onToggleNote: (id: string, done: boolean) => void;
  onPickFiles: (files: FileList | null) => void;
  uploads: { id: string; name: string; size: number; status: "queued"|"uploading"|"processing"|"done"|"error"; progress: number; chunks?: number; error?: string }[];
  onOpenCitation?: (citation: any, index: number) => void;
}) {
  const fmtMB = (b: number) => `${(b/1024/1024).toFixed(1)} MB`;
  const { settings, updateSetting } = useAccessibility();
  return (
    <aside
      className="border-l bg-white max-xl:hidden flex flex-col"
      aria-label="引用と資料リスト"
    >
      <div className="h-10 border-b flex items-center text-sm">
        {["citations", "sources", "notes", "settings"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 h-full flex items-center gap-2 ${tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-600"}`}>
            {t}
            {t === 'sources' && usage && (
              <span className="text-[10px] px-1 rounded bg-slate-100 text-slate-600" title="この会話の資料が全体に占める割合">
                {usage.percentOfAll.toFixed(1)}%
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {tab === "citations" && (
          <div className="space-y-2">
            {/* Profile quick actions */}
            <ProfileQuickActions />
            <div className="text-sm text-slate-600 mb-1">出典（直近回答）</div>
            {citations.length === 0 && <div className="text-xs text-slate-500">出典はまだありません</div>}
            <ol className="space-y-3 border-l pl-3">
              {citations.map((c, i) => (
                <li key={i} className="relative">
                  <div className="absolute -left-3 top-1.5 w-2 h-2 rounded-full bg-blue-500" />
                  <button
                    onClick={() => onOpenCitation?.(c, i)}
                    className="border rounded p-2 bg-white text-left w-full hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-500">#{i + 1}</div>
                      {typeof c.score === 'number' && <div className="text-[11px] text-slate-500">score {c.score.toFixed(2)}</div>}
                    </div>
                    <div className="text-sm font-medium truncate" title={c.title || c.uri || c.source_uri}>{c.title || c.uri || c.source_uri}</div>
                    {c.page && <div className="text-xs text-slate-500">p.{c.page}</div>}
                    {c.content && <div className="mt-1 text-xs text-slate-600 whitespace-pre-wrap line-clamp-5">{c.content}</div>}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}

        {tab === "sources" && (
          <div className="space-y-3">
            <div className="text-sm text-slate-600">この会話で参照する資料</div>
            {usage && (
              <div className="border rounded p-2 bg-slate-50">
                <div className="text-xs text-slate-600">ストレージ使用量</div>
                <div className="mt-1 text-[11px] text-slate-600">
                  この会話 {fmtMB(usage.approxBytes)} / 全体 {fmtMB(Math.max(usage.totalBytesAll, usage.approxBytes))}（約 {usage.percentOfAll.toFixed(1)}%）
                  {typeof usage.percentOfCapacity === 'number' && usage.capacityBytes ? (
                    <> ・ クラスタ許容量比 ≈ {usage.percentOfCapacity.toFixed(1)}% ({fmtMB(usage.capacityBytes)}) ・ 残り {fmtMB(Math.max(0, (usage.capacityBytes||0) - usage.approxBytes))}</>
                  ) : ''}
                </div>
                <div className="mt-2 h-2 bg-slate-200 rounded">
                  <div className="h-2 bg-blue-500 rounded" style={{ width: `${Math.min(100, Math.max(0, usage.percentOfAll))}%` }} />
                </div>
                {typeof usage.percentOfCapacity === 'number' && (
                  <div className="mt-1 h-2 bg-slate-200 rounded" title="クラスタ許容量に対する現在の割合">
                    <div className="h-2 bg-emerald-500 rounded" style={{ width: `${Math.min(100, Math.max(0, usage.percentOfCapacity||0))}%` }} />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="text-sm">
                <span className="inline-block bg-blue-600 text-white px-3 py-1 rounded cursor-pointer">参照資料を追加</span>
                <input type="file" className="hidden" multiple aria-label="Add sources" onChange={(e)=> onPickFiles(e.target.files)} />
              </label>
            </div>
            <div
              className="mt-2 border border-dashed rounded p-4 text-center text-sm text-slate-500 bg-slate-50"
              onDragOver={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e)=>{ e.preventDefault(); e.stopPropagation(); if (e.dataTransfer?.files?.length) onPickFiles(e.dataTransfer.files); }}
              aria-label="Drop to upload"
            >ここにファイルをドラッグ&ドロップ</div>

            {/* Upload progress/status (condensed) */}
            {uploads && uploads.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-slate-500">最近の取込</div>
                <ul className="space-y-2">
                  {uploads.map(u => (
                    <li key={u.id} className="border rounded p-2 bg-white">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium truncate max-w-[220px]" title={u.name}>{u.name}</div>
                        <div className={`text-xs ${u.status === 'done' ? 'text-green-600' : u.status === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
                          {u.status === 'queued' && '準備中'}
                          {u.status === 'uploading' && 'アップロード中'}
                          {u.status === 'processing' && '処理中'}
                          {u.status === 'done' && '完了'}
                          {u.status === 'error' && '失敗'}
                        </div>
                      </div>
                      {(u.status === 'uploading' || u.status === 'processing') && (
                        <div className="mt-2 h-2 bg-slate-100 rounded">
                          <div className="h-2 bg-blue-500 rounded" style={{ width: `${u.status === 'uploading' ? u.progress : 100}%` }} />
                        </div>
                      )}
                      {u.status === 'done' && (
                        <div className="text-[11px] text-slate-500 mt-1">{u.chunks ?? 0} チャンクに分割されました</div>
                      )}
                      {u.status === 'error' && (
                        <div className="text-[11px] text-red-600 mt-1">{u.error || 'エラーが発生しました'}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 既存ドキュメントの一覧 */}
            {/* Current sources */}
            <ul className="space-y-2">
              {sources.length === 0 && <li className="text-xs text-slate-500">参照資料がありません</li>}
              {sources.map((s: any) => {
                const key = (s.title || s.source_uri || s.id)?.toString();
                const usageInfo = (docUsage && key) ? docUsage[key] : undefined;
                const used = !!usageInfo && usageInfo.count > 0;
                return (
                  <li key={s.id} className="border rounded p-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm flex items-center gap-2">
                        <span>{s.title || s.source_uri || s.id}</span>
                        {s.isGlobal && (
                          <span className="text-[10px] text-purple-700 bg-purple-100 rounded px-1" title="My Library 由来の資料">
                            Library
                          </span>
                        )}
                        {used && (
                          <span className="text-[10px] text-green-700 bg-green-100 rounded px-1" title={`${usageInfo?.count||0}件のメッセージで参照`}>
                            参照 {usageInfo?.count||0}件
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">{s.type || "doc"} ・ {s.updatedAt ? new Date(s.updatedAt).toLocaleString() : "—"}{used && usageInfo?.lastAt ? ` ・ 最終参照 ${new Date(usageInfo.lastAt).toLocaleString()}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs flex items-center gap-1">
                        <input type="checkbox" checked={s.enabled !== false} onChange={(e) => onToggleSource(s.id, e.target.checked)} />参照
                      </label>
                      <button className="text-[11px] border rounded px-1 text-slate-500 hover:bg-red-50 hover:text-red-600" title="この参照資料を削除" onClick={()=> onDeleteSource(s.id)}>削除</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {tab === "notes" && (
          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <input className="flex-1 border rounded px-2 py-1 text-sm" placeholder="ノートを追加…" onKeyDown={(e)=>{ if (e.key === 'Enter') { const v=(e.target as HTMLInputElement).value.trim(); if (v) { onAddNote(v); (e.target as HTMLInputElement).value=''; } } }} />
            </div>
            {(!notes || notes.length===0) && <div className="text-xs text-slate-500">まだノートはありません</div>}
            <ul className="space-y-2">
              {notes.map(n => (
                <li key={n.id} className="border rounded p-2 bg-white flex items-center gap-2">
                  <input type="checkbox" checked={!!n.done} onChange={(e)=> onToggleNote(n.id, e.target.checked)} />
                  <div className={`text-sm ${n.done? 'line-through text-slate-400':'text-slate-700'}`}>{n.text}</div>
                  <div className="ml-auto text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">アクセシビリティ設定</h3>
              <p className="text-xs text-slate-600 mb-4">JIS X 8341-3 Level AA準拠</p>
              
              <div className="space-y-4">
                {[
                  {
                    key: "highContrast" as const,
                    label: "ハイコントラスト",
                    description: "文字と背景のコントラストを強化します",
                    icon: "🌓"
                  },
                  {
                    key: "largeText" as const,
                    label: "大きな文字",
                    description: "すべての文字サイズを拡大します",
                    icon: "🔍"
                  },
                  {
                    key: "reducedMotion" as const,
                    label: "アニメーション削減",
                    description: "アニメーションや動的効果を最小限にします",
                    icon: "⏸️"
                  },
                  {
                    key: "screenReaderMode" as const,
                    label: "スクリーンリーダーモード",
                    description: "スクリーンリーダー向けの追加情報を表示します",
                    icon: "🔊"
                  },
                  {
                    key: "focusIndicators" as const,
                    label: "フォーカスインジケーター強化",
                    description: "キーボードフォーカスを明確にします",
                    icon: "🎯"
                  }
                ].map(control => (
                  <div key={control.key} className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-1">
                      <span className="text-sm" role="img" aria-hidden="true">
                        {control.icon}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor={`setting-${control.key}`}
                          className="text-sm font-medium text-slate-900 cursor-pointer"
                        >
                          {control.label}
                        </label>
                        <button
                          id={`setting-${control.key}`}
                          type="button"
                          role="switch"
                          aria-checked={settings[control.key]}
                          onClick={() => updateSetting(control.key, !settings[control.key])}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                            settings[control.key] ? "bg-blue-600" : "bg-slate-200"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              settings[control.key] ? "translate-x-5" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {control.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600">
                  設定は自動的に保存されます。ページを再読み込みしても設定は維持されます。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function ProfileQuickActions() {
  const [profile, set] = useProfile();
  const label = profile === 'quiet' ? '静音・素早い' : profile === 'balanced' ? '普段使い' : '高精度';
  const cls = profile==='quiet' ? 'bg-emerald-100 text-emerald-700' : profile==='balanced' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700';
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className={`text-[11px] rounded px-2 py-0.5 ${cls}`}>この回答モード: {label}</span>
      <button className="text-[11px] border rounded px-2 py-0.5 hover:bg-slate-50" onClick={()=> set('quiet')}>Quiet</button>
      <button className="text-[11px] border rounded px-2 py-0.5 hover:bg-slate-50" onClick={()=> set('balanced')}>Balanced</button>
      <button className="text-[11px] border rounded px-2 py-0.5 hover:bg-slate-50" onClick={()=> set('max')}>Max</button>
    </div>
  );
}
