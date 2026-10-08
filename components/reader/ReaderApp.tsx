"use client";

import { PlayerBar } from "@/components/audio/PlayerBar";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { useIdlePlay, usePlayback } from "@/components/providers/PlaybackProvider";
import { useSettings } from "@/components/providers/SettingsProvider";
import { PdfViewport } from "@/components/pdf/PdfViewport";
import { Transcript } from "@/components/reader/Transcript";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { extractDocument } from "@/lib/pdf/extract";
import { openPdf, renderThumbnail } from "@/lib/pdf/load";
import { pdfErrorMessage, PdfPasswordError } from "@/lib/pdf/validate";
import { resolveScope } from "@/lib/playback/scope";
import { getDocument, getExtraction, getFile, saveExtraction } from "@/lib/storage/db";
import { estimateMinutesLeft } from "@/lib/utils";
import type { Extraction, ReadScope, Sentence } from "@/types/reading";
import { ChevronLeft, Moon, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Stage =
  | { type: "opening" }
  | { type: "extracting"; current: number; total: number }
  | { type: "password" }
  | { type: "ready" };

const NO_SENTENCES: Sentence[] = [];

export function ReaderApp({ id }: { id: string }) {
  const library = useLibrary();
  const playback = usePlayback();
  const { settings, update, setSettingsOpen } = useSettings();
  const { snapshot } = playback;
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [name, setName] = useState("Document");
  const [stage, setStage] = useState<Stage>({ type: "opening" });
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [passwordIncorrect, setPasswordIncorrect] = useState(false);
  const [scope, setScope] = useState<ReadScope>({ type: "from-here" });
  const [pinnedPage, setPinnedPage] = useState<number | null>(null);
  const [tab, setTab] = useState<"document" | "text">("text");
  const [query, setQuery] = useState("");
  const [matchCursor, setMatchCursor] = useState(0);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(1);
  const sessionKey = `${id}:${password ?? ""}`;
  const [loadedKey, setLoadedKey] = useState(sessionKey);
  if (loadedKey !== sessionKey) {
    setLoadedKey(sessionKey);
    setPdf(null);
    setExtraction(null);
    setError(null);
    setStage({ type: "opening" });
  }

  useEffect(() => {
    let cancelled = false;
    let proxy: PDFDocumentProxy | null = null;
    let release: (() => void) | null = null;
    const destroyProxy = () => {
      proxy = null;
      release?.();
      release = null;
    };

    void (async () => {
      try {
        const record = await getDocument(id);
        if (!record) {
          setError("This document isn't in your library.");
          return;
        }
        if (cancelled) return;
        setName(record.name);
        const bytes = await getFile(id);
        const opened = await openPdf(bytes.slice(0), password);
        proxy = opened.pdf;
        release = opened.destroy;
        if (cancelled) {
          destroyProxy();
          return;
        }
        setPdf(proxy);
        let extracted = await getExtraction(id);
        if (!extracted) {
          setStage({ type: "extracting", current: 0, total: proxy.numPages });
          extracted = await extractDocument(proxy, (current, total) => {
            if (!cancelled) setStage({ type: "extracting", current, total });
          });
          await saveExtraction(id, extracted);
        }
        if (cancelled) {
          destroyProxy();
          return;
        }
        setExtraction(extracted);
        await library.patch(id, {
          pageCount: proxy.numPages,
          sentenceCount: extracted.sentences.length,
          language: extracted.language,
          title: extracted.title,
          hasText: extracted.sentences.length > 0,
          scanned: extracted.scanned,
          lastOpenedAt: Date.now(),
          currentPage: record.currentPage || 1,
        });
        playback.load({
          id,
          name: record.name,
          pageCount: proxy.numPages,
          extraction: extracted,
          restoreIndex: record.currentSentenceIndex || 0,
        });
        setRangeTo(proxy.numPages);
        setStage({ type: "ready" });
        if (!record.thumbnail) {
          const thumbnail = await renderThumbnail(proxy);
          if (thumbnail && !cancelled) await library.patch(id, { thumbnail });
        }
      } catch (reason) {
        if (cancelled) return;
        if (reason instanceof PdfPasswordError) {
          setPasswordIncorrect(reason.incorrect);
          setStage({ type: "password" });
          return;
        }
        console.error(reason);
        setError(pdfErrorMessage(reason));
      }
    })();

    return () => {
      cancelled = true;
      destroyProxy();
    };
    // Library and playback identities change with snapshots; this load should run once per document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, password]);

  const sentences = extraction?.sentences ?? NO_SENTENCES;
  const shownPage = pinnedPage ?? snapshot.pageNumber ?? 1;
  const pageSentences = sentences.filter((sentence) => sentence.pageNumber === shownPage);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return sentences.filter((sentence) => sentence.text.toLowerCase().includes(needle));
  }, [query, sentences]);
  const activeMatch = matches[matchCursor] ?? null;
  const remaining =
    sentences.length > 0
      ? estimateMinutesLeft(
          sentences.slice(snapshot.sentenceIndex).reduce((total, sentence) => total + sentence.text.length, 0),
          snapshot.rate,
        )
      : "";
  const blocked = !extraction || extraction.scanned || sentences.length === 0;

  function playScope(next: ReadScope) {
    if (!extraction || blocked) return;
    const resolved = resolveScope(extraction.sentences, extraction.paragraphs, next, snapshot.sentenceIndex);
    if (!resolved) {
      setError("There's no readable text there.");
      return;
    }
    setError(null);
    setScope(next);
    setPinnedPage(null);
    playback.playRange(resolved.start, resolved.end, resolved.label);
  }

  function onPrimary() {
    if (blocked) return;
    if (snapshot.status === "playing" || snapshot.status === "preparing") playback.pause();
    else if (snapshot.status === "paused" || snapshot.status === "error") playback.resume();
    else if (snapshot.status === "ended") playback.replay();
    else playScope(scope);
  }

  useIdlePlay(() => {
    if (snapshot.status === "idle") playScope(scope);
  });

  function jumpToMatch(direction: 1 | -1) {
    if (!matches.length) return;
    const next = (matchCursor + direction + matches.length) % matches.length;
    setMatchCursor(next);
    const sentence = matches[next];
    if (!sentence) return;
    setPinnedPage(sentence.pageNumber);
    if (snapshot.status !== "playing" && snapshot.status !== "preparing") playback.moveTo(sentence.index);
  }

  const dark =
    settings.theme === "dark" ||
    (settings.theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="flex h-dvh flex-col bg-bg text-ink">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Link
          href="/"
          className="inline-flex h-10 items-center gap-1 rounded-full px-2 text-sm hover:bg-bg-raised"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Library
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center text-sm font-medium">{extraction?.title || name}</h1>
        <p className="hidden text-sm text-muted sm:block">{Math.round(snapshot.progress * 100)}% completed</p>
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
      </header>

      {stage.type !== "ready" && !error ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div className="w-full max-w-sm">
            <p className="font-serif text-2xl">
              {stage.type === "extracting" ? `Preparing ${stage.current} of ${stage.total} pages…` : "Opening PDF…"}
            </p>
            {stage.type === "extracting" ? (
              <div className="mt-4 h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{ width: `${Math.round((stage.current / Math.max(1, stage.total)) * 100)}%` }}
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">Reading the file and finding the text.</p>
            )}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div className="max-w-md">
            <p className="font-serif text-3xl">This PDF could not be opened</p>
            <p className="mt-3 text-sm leading-6 text-muted">{error}</p>
            <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-4 text-sm text-bg">
              Back to library
            </Link>
          </div>
        </div>
      ) : null}

      {stage.type === "ready" && extraction && pdf && !error ? (
        <>
          {extraction.scanned ? (
            <p className="border-b border-line bg-accent-soft px-4 py-3 text-sm text-ink" role="status">
              This PDF appears to be scanned. OCR support is coming soon.
            </p>
          ) : null}
          {extraction.notes.map((note) => (
            <p key={note} className="border-b border-line px-4 py-2 text-sm text-muted">
              {note}
            </p>
          ))}
          <div className="flex border-b border-line md:hidden">
            {(["document", "text"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={tab === item}
                className="h-11 flex-1 text-sm capitalize aria-pressed:border-b-2 aria-pressed:border-ink"
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1.15fr)_minmax(22rem,34rem)]">
            <div className={tab === "document" ? "min-h-0" : "hidden min-h-0 md:block"}>
              <PdfViewport
                pdf={pdf}
                pageNumber={Math.min(Math.max(1, shownPage), pdf.numPages)}
                pageCount={pdf.numPages}
                query={query}
                onQuery={(value) => {
                  setQuery(value);
                  setMatchCursor(0);
                }}
                matchLabel={matches.length ? `${matchCursor + 1} of ${matches.length}` : query ? "No matches" : ""}
                onPageChange={(page) => setPinnedPage(page)}
                onPreviousMatch={() => jumpToMatch(-1)}
                onNextMatch={() => jumpToMatch(1)}
              />
            </div>
            <div className={tab === "text" ? "flex min-h-0 flex-col" : "hidden min-h-0 md:flex md:flex-col"}>
              {pinnedPage !== null && pinnedPage !== snapshot.pageNumber ? (
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 text-sm">
                  <p>Reading is on page {snapshot.pageNumber}.</p>
                  <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setPinnedPage(null)}>
                    Back to reading
                  </button>
                </div>
              ) : null}
              <div className="border-b border-line px-4 py-4 md:px-6">
                <p className="text-xs tracking-wide text-faint uppercase">Now reading</p>
                <p className="mt-2 font-serif text-2xl leading-snug">
                  {snapshot.status === "ended" && snapshot.endedDocument
                    ? "You've reached the end."
                    : snapshot.currentText || "Press Read aloud to begin."}
                </p>
              </div>
              <div className="min-h-0 flex-1">
                <Transcript
                  sentences={pageSentences}
                  currentIndex={snapshot.sentenceIndex}
                  matchIndex={activeMatch?.index ?? null}
                  onMove={(index) => {
                    setPinnedPage(null);
                    playback.moveTo(index);
                  }}
                  onReadSelection={(text, indexes) => {
                    if (indexes.length > 1) {
                      playback.playRange(Math.min(...indexes), Math.max(...indexes), "Selection");
                      return;
                    }
                    if (indexes.length === 1) {
                      const full = sentences.find((sentence) => sentence.index === indexes[0])?.text ?? "";
                      if (text.length > full.length * 0.85) {
                        playback.playRange(indexes[0], indexes[0], "This sentence");
                        return;
                      }
                    }
                    playback.playText(text);
                  }}
                  onReadFrom={(index) => {
                    playback.playRange(index, Math.max(index, sentences.length - 1), "From here");
                    setScope({ type: "from-here" });
                    setPinnedPage(null);
                  }}
                />
              </div>
            </div>
          </div>
          <PlayerBar
            snapshot={snapshot}
            disabled={blocked}
            activeScope={scope.type}
            remaining={remaining}
            onPrimary={onPrimary}
            onPrevious={() => playback.previous()}
            onNext={() => playback.next()}
            onScrub={(ratio) => playback.seekRatio(ratio)}
            onRate={(rate) => update({ rate })}
            onVolume={(volume) => update({ volume })}
            onScope={playScope}
            onPageRange={() => setRangeOpen(true)}
          />
        </>
      ) : null}

      <Dialog
        open={stage.type === "password"}
        title="This PDF is locked"
        description={passwordIncorrect ? "That password didn't work." : "Enter the password to open it."}
        onClose={() => setStage({ type: "opening" })}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setPassword(String(data.get("password") ?? ""));
          }}
        >
          <label className="block text-sm font-medium">
            Password
            <input
              name="password"
              type="password"
              autoFocus
              className="mt-2 h-11 w-full rounded-lg border border-line bg-bg px-3"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Link href="/" className="inline-flex h-11 items-center rounded-full px-4 text-sm">
              Cancel
            </Link>
            <Button type="submit">Unlock</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={rangeOpen}
        title="Read pages"
        description="Choose the first and last page to read."
        onClose={() => setRangeOpen(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            playScope({ type: "pages", from: rangeFrom, to: rangeTo });
            setRangeOpen(false);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">
              From page
              <input
                type="number"
                min={1}
                max={pdf?.numPages ?? 1}
                value={rangeFrom}
                onChange={(event) => setRangeFrom(Number(event.target.value))}
                className="mt-2 h-11 w-full rounded-lg border border-line bg-bg px-3"
              />
            </label>
            <label className="text-sm font-medium">
              To page
              <input
                type="number"
                min={1}
                max={pdf?.numPages ?? 1}
                value={rangeTo}
                onChange={(event) => setRangeTo(Number(event.target.value))}
                className="mt-2 h-11 w-full rounded-lg border border-line bg-bg px-3"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="submit">Read pages</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
