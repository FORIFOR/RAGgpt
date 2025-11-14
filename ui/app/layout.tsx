import "./globals.css";
import React from "react";
import AppHeader from "@/components/AppHeader";

export const metadata = {
  title: "RAGgpt",
  description: "Minimal RAG chat for JP/EN",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className="min-h-screen bg-slate-50">
        <div className="flex min-h-screen flex-col">
          <AppHeader />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
