"use client";
import React, { useEffect, useState } from "react";

type Model = { id: string; label: string; kind: "local" | "cloud"; ready: boolean };

export function ModelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [models, setModels] = useState<Model[]>([
    { id: "gpt-oss-20b", label: "gpt-oss-20b (Local)", kind: "local", ready: true },
    { id: "gpt-4o-mini", label: "gpt-4o-mini (Cloud)", kind: "cloud", ready: true },
  ]);

  useEffect(() => {
    console.log("ModelSelect: Fetching /api/models");
    fetch("/api/models")
      .then((r) => r.json())
      .then((r) => {
        console.log("ModelSelect: API response:", r);
        setModels((prev) =>
          prev.map((m) => (m.id === "gpt-oss-20b" ? { ...m, ready: !!r.lmstudio_up } : m))
        );
        if (r.lmstudio_up) {
          console.log("ModelSelect: LMStudio is up, switching to gpt-oss-20b");
          onChange("gpt-oss-20b");
        }
      })
      .catch((e) => {
        console.error("ModelSelect: Fetch error:", e);
      });
  }, [onChange]);

  return (
    <select
      className="border rounded px-2 py-1 text-sm w-56"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {models.map((m) => (
        <option key={m.id} value={m.id} disabled={m.kind === "local" && !m.ready}>
          {m.label}
          {m.kind === "local" && !m.ready ? " — Not running" : ""}
        </option>
      ))}
    </select>
  );
}

