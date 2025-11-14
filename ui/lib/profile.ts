"use client";
import { useEffect, useState } from "react";

export type Profile = "quiet" | "balanced" | "max";
const KEY = "rag.profile";

export function getProfile(): Profile {
  if (typeof window === "undefined") return "balanced";
  try {
    const v = (localStorage.getItem(KEY) || "balanced").toLowerCase();
    if (v === "quiet" || v === "balanced" || v === "max") return v;
  } catch {}
  return "balanced";
}

export function setProfile(p: Profile) {
  try { localStorage.setItem(KEY, p); } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("profile:change", { detail: p }));
  }
}

export function useProfile(): [Profile, (p: Profile) => void] {
  const [profile, set] = useState<Profile>(getProfile());
  useEffect(() => {
    const onChange = (e: any) => set((e?.detail as Profile) || getProfile());
    window.addEventListener("profile:change", onChange as any);
    return () => window.removeEventListener("profile:change", onChange as any);
  }, []);
  const update = (p: Profile) => { set(p); setProfile(p); };
  return [profile, update];
}

