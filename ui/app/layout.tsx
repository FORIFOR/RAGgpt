"use client";

import "./globals.css";
import { Noto_Sans_JP } from "next/font/google";
import React from "react";
import AppHeader from "@/components/AppHeader";
import { AuthProvider } from "@/lib/auth-context";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-jp",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <title>RAGgpt</title>
      </head>
      <body className={`min-h-screen h-full bg-slate-50 ${notoSansJP.className}`}>
        <AuthProvider>
          <div className="flex min-h-screen h-full flex-col">
            <AppHeader />
            <main className="flex-1 flex flex-col">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
