"use client";
import { useEffect } from "react";

export default function RedirectToUnified() {
  useEffect(() => {
    try {
      const convId = localStorage.getItem("rag.activeConv") || Math.random().toString(36).slice(2);
      localStorage.setItem("rag.activeConv", convId);
      const url = new URL(window.location.href);
      const kb = url.searchParams.get('kb');
      const dest = kb ? `/n/${convId}?kb=${encodeURIComponent(kb)}` : `/n/${convId}`;
      window.location.replace(dest);
    } catch {
      window.location.replace('/home');
    }
  }, []);
  return null;
}

