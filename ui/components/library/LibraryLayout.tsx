"use client";

import { useState } from "react";

import { LibraryHeader } from "./LibraryHeader";
import { LibraryMain } from "./LibraryMain";
import { LibrarySidebar } from "./LibrarySidebar";

import { TagFilterState } from "@/lib/tags";

export type Scope = "personal" | "team" | "org" | "company";

export function LibraryLayout() {
  const [scope, setScope] = useState<Scope>("personal");
  const [currentFolder, setCurrentFolder] = useState<string>("/");
  const [searchQuery, setSearchQuery] = useState("");
  const [tags, setTags] = useState<TagFilterState>({});

  return (
    <div className="min-h-screen bg-sumi-50">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <LibraryHeader
          scope={scope}
          onScopeChange={setScope}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <main className="mt-5 flex-1">
          <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="rounded-lg border border-sumi-200 bg-white shadow-sm">
              <LibrarySidebar
                scope={scope}
                currentFolder={currentFolder}
                onFolderChange={setCurrentFolder}
                tags={tags}
                onTagsChange={setTags}
              />
            </aside>

            <section className="rounded-lg border border-sumi-200 bg-white shadow-sm">
              <LibraryMain
                scope={scope}
                currentFolder={currentFolder}
                searchQuery={searchQuery}
                tags={tags}
              />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
