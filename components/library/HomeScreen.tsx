"use client";

import { DocumentCard } from "@/components/library/DocumentCard";
import { Dropzone } from "@/components/library/Dropzone";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import { Moon, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function HomeScreen() {
  const { documents, ready } = useLibrary();
  const { settings, update, setSettingsOpen } = useSettings();
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setSystemDark(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const dark = settings.theme === "dark" || (settings.theme === "system" && systemDark);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5">
      <header className="flex items-center justify-between py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="font-display text-2xl tracking-tight">ReadFlow</span>
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full hover:bg-bg-raised"
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => update({ theme: dark ? "light" : "dark" })}
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full hover:bg-bg-raised"
            aria-label="Reading settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-4" />
          </button>
        </div>
      </header>
      <main className="flex-1 pb-28 pt-6 md:pt-12">
        <h1 className="max-w-xl font-serif text-4xl leading-tight tracking-tight md:text-5xl">
          Turn any PDF into something you can listen to.
        </h1>
        <Dropzone />
        {ready && documents.length > 0 ? (
          <section className="mt-12" aria-labelledby="library-heading">
            <h2 id="library-heading" className="text-sm font-medium tracking-wide text-muted">
              Library
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {documents.map((document) => (
                <DocumentCard key={document.id} document={document} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-ink" />
      <path
        d="M9.2 7.2h8.6c3.15 0 5.2 1.85 5.2 4.45 0 2.15-1.35 3.7-3.35 4.2L22.6 24.8h-3.85l-2.85-8.2H12.7v8.2H9.2V7.2zm3.5 4.55v4.15h4.55c1.35 0 2.15-.65 2.15-1.7 0-1.05-.8-1.7-2.15-1.7h-4.55z"
        className="fill-bg"
      />
    </svg>
  );
}
