"use client";

import { formatPercent, formatSpeed } from "@/lib/utils";
import type { PlaybackSnapshot, ReadScope } from "@/types/reading";
import { SPEEDS } from "@/types/reading";
import { Loader2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const SCOPES: { scope: ReadScope; label: string }[] = [
  { scope: { type: "from-here" }, label: "From here" },
  { scope: { type: "sentence" }, label: "Sentence" },
  { scope: { type: "paragraph" }, label: "Paragraph" },
  { scope: { type: "page" }, label: "This page" },
  { scope: { type: "document" }, label: "Document" },
];

export function PlayerBar({
  snapshot,
  disabled,
  activeScope,
  remaining,
  onPrimary,
  onPrevious,
  onNext,
  onScrub,
  onRate,
  onVolume,
  onScope,
  onPageRange,
}: {
  snapshot: PlaybackSnapshot;
  disabled: boolean;
  activeScope: ReadScope["type"];
  remaining: string;
  onPrimary: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onScrub: (ratio: number) => void;
  onRate: (rate: number) => void;
  onVolume: (volume: number) => void;
  onScope: (scope: ReadScope) => void;
  onPageRange: () => void;
}) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const playing = snapshot.status === "playing" || snapshot.status === "preparing";
  const transport = snapshot.status !== "idle";
  const primary =
    snapshot.status === "error"
      ? "Try again"
      : snapshot.status === "ended"
        ? "Read again"
        : snapshot.progress > 0.01
          ? "Continue"
          : "Read aloud";

  useEffect(() => {
    if (!speedOpen && !volumeOpen) return;
    const close = (event: MouseEvent) => {
      if (!speedRef.current?.contains(event.target as Node)) {
        setSpeedOpen(false);
        setVolumeOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [speedOpen, volumeOpen]);

  const ratio = scrub ?? snapshot.progress;

  return (
    <section
      ref={speedRef}
      aria-label="Playback"
      className="border-t border-line bg-surface px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5"
    >
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {SCOPES.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={disabled}
            aria-pressed={activeScope === item.scope.type}
            className="h-8 shrink-0 rounded-full border border-transparent px-3 text-sm text-muted aria-pressed:border-line aria-pressed:bg-bg-raised aria-pressed:text-ink"
            onClick={() => onScope(item.scope)}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          className="h-8 shrink-0 rounded-full px-3 text-sm text-muted hover:text-ink"
          onClick={onPageRange}
        >
          Pages…
        </button>
      </div>

      <p className="mb-2 line-clamp-2 min-h-6 font-serif text-base leading-snug md:line-clamp-1">
        {snapshot.preparingDetail && snapshot.status === "preparing"
          ? snapshot.preparingDetail
          : snapshot.status === "error"
            ? snapshot.error
            : snapshot.status === "ended" && snapshot.endedDocument
              ? "You've reached the end."
              : snapshot.currentText || "Choose where to begin, then press Read aloud."}
      </p>

      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <label className="sr-only" htmlFor="reading-progress">
            Reading position
          </label>
          <input
            id="reading-progress"
            className="w-full"
            type="range"
            min={0}
            max={1000}
            value={Math.round(ratio * 1000)}
            disabled={disabled || snapshot.sentenceCount === 0}
            aria-valuetext={formatPercent(ratio)}
            onChange={(event) => setScrub(Number(event.target.value) / 1000)}
            onPointerUp={(event) => {
              onScrub(Number((event.target as HTMLInputElement).value) / 1000);
              setScrub(null);
            }}
            onKeyUp={(event) => {
              onScrub(Number((event.target as HTMLInputElement).value) / 1000);
              setScrub(null);
            }}
          />
          <div className="mt-1 flex justify-between gap-3 text-xs text-faint">
            <span>
              Page {snapshot.pageNumber || 1}
              {snapshot.pageCount ? ` / ${snapshot.pageCount}` : ""}
            </span>
            <span>{formatPercent(snapshot.progress)} completed</span>
            <span className="hidden sm:inline">{remaining}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            className="grid size-12 place-items-center rounded-full hover:bg-bg-raised disabled:opacity-40"
            aria-label="Previous sentence"
            disabled={disabled}
            onClick={onPrevious}
          >
            <SkipBack className="size-5" />
          </button>
          {transport ? (
            <button
              type="button"
              className="grid size-14 place-items-center rounded-full bg-ink text-bg disabled:opacity-40"
              aria-label={playing ? "Pause" : primary}
              disabled={disabled && snapshot.status !== "error"}
              onClick={onPrimary}
            >
              {snapshot.status === "preparing" ? (
                <Loader2 className="size-5 animate-spin" />
              ) : playing ? (
                <Pause className="size-6" />
              ) : (
                <Play className="ml-0.5 size-6" />
              )}
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-5 font-medium text-bg disabled:opacity-40"
              disabled={disabled}
              onClick={onPrimary}
            >
              <Play className="size-4" aria-hidden="true" />
              {primary}
            </button>
          )}
          <button
            type="button"
            className="grid size-12 place-items-center rounded-full hover:bg-bg-raised disabled:opacity-40"
            aria-label="Next sentence"
            disabled={disabled}
            onClick={onNext}
          >
            <SkipForward className="size-5" />
          </button>
          <div className="relative">
            <button
              type="button"
              className="h-10 rounded-full px-3 text-sm hover:bg-bg-raised"
              aria-expanded={speedOpen}
              aria-haspopup="listbox"
              onClick={() => setSpeedOpen((open) => !open)}
            >
              {formatSpeed(snapshot.rate)}
            </button>
            {speedOpen ? (
              <ul
                role="listbox"
                aria-label="Playback speed"
                className="absolute bottom-12 right-0 z-10 w-24 rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow)]"
              >
                {SPEEDS.map((rate) => (
                  <li key={rate}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={rate === snapshot.rate}
                      className="h-9 w-full rounded-md text-sm aria-selected:bg-bg-raised"
                      onClick={() => {
                        onRate(rate);
                        setSpeedOpen(false);
                      }}
                    >
                      {formatSpeed(rate)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="relative">
            <button
              type="button"
              className="grid size-10 place-items-center rounded-full hover:bg-bg-raised"
              aria-label={snapshot.volume === 0 ? "Unmute" : "Volume"}
              aria-expanded={volumeOpen}
              onClick={() => {
                if (snapshot.volume === 0) onVolume(1);
                else setVolumeOpen((open) => !open);
              }}
            >
              {snapshot.volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            {volumeOpen ? (
              <div className="absolute bottom-12 right-0 z-10 w-36 rounded-lg border border-line bg-surface p-3 shadow-[var(--shadow)]">
                <label className="text-xs text-muted" htmlFor="volume">
                  Volume
                </label>
                <input
                  id="volume"
                  className="mt-2 w-full"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={snapshot.volume}
                  onChange={(event) => onVolume(Number(event.target.value))}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
