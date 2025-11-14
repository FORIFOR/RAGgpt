"use client";

import { useEffect, useMemo, useState } from "react";

type ServiceName = "rag" | "mcp" | "meilisearch" | "qdrant" | "reranker";

type ServiceHealth = {
  ok: boolean;
  ms?: number;
  status: "healthy" | "degraded" | "down" | "skipped";
  service: string;
  error?: string;
  skipped?: boolean;
};

type ServiceStatus = Record<ServiceName, ServiceHealth | null>;

type ServiceDefinition = {
  name: ServiceName;
  label: string;
  optional: boolean;
  defaultEnabled: boolean;
};

const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  { name: "rag", label: "RAG", optional: false, defaultEnabled: true },
  { name: "mcp", label: "MCP", optional: false, defaultEnabled: true },
  { name: "meilisearch", label: "Meilisearch", optional: true, defaultEnabled: false },
  { name: "qdrant", label: "Qdrant", optional: true, defaultEnabled: false },
  { name: "reranker", label: "Reranker", optional: true, defaultEnabled: false },
];

function readFeatureFlag(name: string, defaultValue: boolean): boolean {
  const envKey = `NEXT_PUBLIC_FEATURE_${name.toUpperCase()}`;
  const raw = process.env[envKey];
  if (raw === undefined) return defaultValue;
  if (/^(false|0|off)$/i.test(raw)) return false;
  if (/^(true|1|on)$/i.test(raw)) return true;
  return defaultValue;
}

const skippedHealth = (service: ServiceName): ServiceHealth => ({
  ok: false,
  status: "skipped",
  service,
  skipped: true,
});

/**
 * ServiceStatusBar - Shows real-time health status of backend services
 * Displays at the bottom of the layout for visibility
 */
export function ServiceStatusBar() {
  const serviceConfigs = useMemo(() => {
    return SERVICE_DEFINITIONS.map((def) => ({
      ...def,
      enabled: readFeatureFlag(def.name, def.defaultEnabled),
    }));
  }, []);

  const initialState = useMemo(() => {
    return serviceConfigs.reduce<ServiceStatus>((acc, def) => {
      acc[def.name] = def.enabled ? null : skippedHealth(def.name);
      return acc;
    }, {} as ServiceStatus);
  }, [serviceConfigs]);

  const [services, setServices] = useState<ServiceStatus>(initialState);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      const active = serviceConfigs.filter((def) => def.enabled);
      if (active.length === 0) return;

      const results: Partial<ServiceStatus> = {};

      await Promise.all(
        active.map(async (def) => {
          try {
            const r = await fetch(`/api/health/${def.name}`, {
              cache: "no-store",
            });
            const json = await r.json();
            results[def.name] = json;
          } catch (error: any) {
            results[def.name] = {
              ok: false,
              status: "down",
              service: def.name,
              error: error?.message || "Network error",
            };
          }
        })
      );

      setServices((prev) => ({
        ...prev,
        ...results,
      }));
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [serviceConfigs]);

  const labelMap = useMemo(
    () =>
      serviceConfigs.reduce<Record<ServiceName, string>>((acc, def) => {
        acc[def.name] = def.label;
        return acc;
      }, {} as Record<ServiceName, string>),
    [serviceConfigs]
  );

  const liveStatuses = serviceConfigs
    .map((def) => services[def.name])
    .filter(
      (health): health is ServiceHealth =>
        !!health && health.skipped !== true
    );

  const hasLiveStatuses = liveStatuses.length > 0;
  const allHealthy =
    hasLiveStatuses && liveStatuses.every((health) => health.ok);
  const anyDown = liveStatuses.some((health) => health.status === "down");
  const anyDegraded = liveStatuses.some(
    (health) => health.status === "degraded"
  );

  const statusColor = hasLiveStatuses
    ? allHealthy
      ? "bg-green-100 text-green-800 border-green-200"
      : anyDown
      ? "bg-red-100 text-red-800 border-red-200"
      : anyDegraded
      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
      : "bg-slate-100 text-slate-600 border-slate-200"
    : "bg-slate-100 text-slate-600 border-slate-200";

  const statusIcon = hasLiveStatuses
    ? allHealthy
      ? "●"
      : anyDown
      ? "●"
      : "●"
    : "○";

  const summaryText = hasLiveStatuses
    ? allHealthy
      ? "すべてのサービスが正常です"
      : anyDown
      ? "一部のサービスがダウンしています"
      : "一部のサービスが低速です"
    : "監視対象サービスはありません";

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 border-t ${statusColor} transition-all`}
    >
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-xs font-medium hover:bg-black/5"
          >
            <span className="text-lg">{statusIcon}</span>
            <span>{summaryText}</span>
            <span className="text-[10px] text-current">
              {expanded ? "▼" : "▶"}
            </span>
          </button>

          <div className="flex items-center gap-4">
            {serviceConfigs.map((def) => {
              const health = services[def.name];

              if (!health) {
                return (
                  <div key={def.name} className="text-xs text-slate-500">
                    <span className="font-medium">{labelMap[def.name]}</span>
                    <span className="ml-1 text-slate-400">測定中…</span>
                  </div>
                );
              }

              if (health.skipped) {
                return (
                  <div key={def.name} className="text-xs text-slate-500">
                    <span className="font-medium">{labelMap[def.name]}</span>
                    <span className="ml-1 text-slate-400">N/A</span>
                  </div>
                );
              }

              const colorClass = health.ok
                ? "text-green-700"
                : health.status === "down"
                ? "text-red-700"
                : "text-yellow-700";

              return (
                <div key={def.name} className={`text-xs ${colorClass}`}>
                  <span className="font-medium">{labelMap[def.name]}</span>
                  {typeof health.ms === "number" && (
                    <span className="ml-1 text-slate-600">{health.ms}ms</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {expanded && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            {serviceConfigs.map((def) => {
              const health = services[def.name];

              if (!health) {
                return (
                  <div
                    key={def.name}
                    className="p-2 rounded border bg-slate-50 border-slate-200 text-slate-500"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold">
                        {labelMap[def.name]}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                        checking
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      ヘルスチェック中…
                    </div>
                  </div>
                );
              }

              if (health.skipped) {
                return (
                  <div
                    key={def.name}
                    className="p-2 rounded border bg-slate-50 border-slate-200 text-slate-500"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold">
                        {labelMap[def.name]}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                        skipped
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      未使用のサービスです
                    </div>
                  </div>
                );
              }

              const badgeClass = health.ok
                ? "bg-green-200 text-green-900"
                : health.status === "down"
                ? "bg-red-200 text-red-900"
                : "bg-yellow-200 text-yellow-900";

              const cardClass = health.ok
                ? "bg-green-50 border-green-200"
                : health.status === "down"
                ? "bg-red-50 border-red-200"
                : "bg-yellow-50 border-yellow-200";

              return (
                <div key={def.name} className={`p-2 rounded border ${cardClass}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold">
                      {labelMap[def.name]}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeClass}`}>
                      {health.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {health.ok ? (
                      <span>
                        レイテンシ:{" "}
                        {typeof health.ms === "number" ? `${health.ms}ms` : "n/a"}
                      </span>
                    ) : (
                      <span>エラー: {health.error ?? "不明なエラー"}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
