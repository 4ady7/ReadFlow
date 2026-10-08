"use client";

import { cn } from "@/lib/utils";
import type { Sentence } from "@/types/reading";
import { useEffect, useRef, useState } from "react";

export function Transcript({
  sentences,
  currentIndex,
  matchIndex,
  onMove,
  onReadSelection,
  onReadFrom,
}: {
  sentences: Sentence[];
  currentIndex: number;
  matchIndex: number | null;
  onMove: (index: number) => void;
  onReadSelection: (text: string, indexes: number[]) => void;
  onReadFrom: (index: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    text: string;
    indexes: number[];
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const container = scroller.current;
    const selection = window.getSelection();
    if (!container || (selection && !selection.isCollapsed)) return;
    const node = container.querySelector<HTMLElement>(`[data-sentence="${currentIndex}"]`);
    if (!node) return;
    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const delta = nodeRect.top - containerRect.top - container.clientHeight / 2 + nodeRect.height / 2;
    if (Math.abs(delta) < 24) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    container.scrollBy({ top: delta, behavior: reduce ? "auto" : "smooth" });
  }, [currentIndex, sentences]);

  if (!sentences.length) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm text-muted">
        No readable text on this page.
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div
        ref={scroller}
        className="h-full overflow-y-auto px-4 py-4 md:px-6"
        onMouseUp={(event) => {
          const root = event.currentTarget;
          const selection = window.getSelection();
          if (!selection || selection.isCollapsed || !selection.anchorNode || !root.contains(selection.anchorNode)) {
            setMenu(null);
            return;
          }
          const text = selection.toString().replace(/\s+/g, " ").trim();
          if (text.length < 2) {
            setMenu(null);
            return;
          }
          const indexes: number[] = [];
          root.querySelectorAll<HTMLElement>("[data-sentence]").forEach((element) => {
            if (selection.containsNode(element, true)) indexes.push(Number(element.dataset.sentence));
          });
          const rect = selection.getRangeAt(0).getBoundingClientRect();
          setMenu({
            text,
            indexes: indexes.filter(Number.isFinite),
            x: rect.left + rect.width / 2,
            y: rect.top,
          });
        }}
      >
        <div className="mx-auto max-w-xl space-y-1">
          {sentences.map((sentence) => {
            const active = sentence.index === currentIndex;
            const matched = sentence.index === matchIndex;
            return (
              <div
                key={sentence.id}
                role="button"
                tabIndex={0}
                data-sentence={sentence.index}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left font-serif text-lg leading-relaxed",
                  sentence.kind === "heading" && "text-2xl font-semibold",
                  sentence.kind === "caption" && "text-sm text-muted",
                  sentence.kind === "footnote" && "text-sm text-muted",
                  sentence.kind === "quote" && "italic",
                  active ? "bg-highlight text-highlight-ink" : "hover:bg-bg-raised",
                  matched && !active && "outline outline-1 outline-accent",
                )}
                onClick={() => onMove(sentence.index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onMove(sentence.index);
                  }
                }}
              >
                {sentence.text}
              </div>
            );
          })}
        </div>
      </div>
      {menu ? (
        <div
          role="menu"
          className="fixed z-30 flex -translate-x-1/2 -translate-y-full gap-1 rounded-full border border-line bg-surface p-1 shadow-[var(--shadow)]"
          style={{ left: menu.x, top: Math.max(12, menu.y - 8) }}
        >
          <button
            type="button"
            role="menuitem"
            className="h-9 rounded-full bg-ink px-3 text-sm text-bg"
            onClick={() => {
              onReadSelection(menu.text, menu.indexes);
              setMenu(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            Read aloud
          </button>
          <button
            type="button"
            role="menuitem"
            className="h-9 rounded-full px-3 text-sm"
            onClick={() => {
              const start = menu.indexes.length ? Math.min(...menu.indexes) : currentIndex;
              onReadFrom(start);
              setMenu(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            Read from here
          </button>
        </div>
      ) : null}
    </div>
  );
}
