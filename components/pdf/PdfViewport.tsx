"use client";

import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

export function PdfViewport({
  pdf,
  pageNumber,
  pageCount,
  query,
  onQuery,
  matchLabel,
  onPageChange,
  onPreviousMatch,
  onNextMatch,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  pageCount: number;
  query: string;
  onQuery: (value: string) => void;
  matchLabel: string;
  onPageChange: (page: number) => void;
  onPreviousMatch: () => void;
  onNextMatch: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState(true);
  const [rendering, setRendering] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [editingPage, setEditingPage] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!fit) return;
    const element = containerRef.current;
    if (!element) return;
    let cancelled = false;
    const apply = () => {
      void pdf.getPage(pageNumber).then((page) => {
        if (cancelled) return;
        const width = page.getViewport({ scale: 1 }).width || 1;
        setScale(Math.min(2.4, Math.max(0.4, (element.clientWidth - 28) / width)));
      });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [fit, pageNumber, pdf]);

  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | null = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRendering(true);
    void pdf
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return null;
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext("2d");
        if (!context) return null;
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        task = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        return task.promise;
      })
      .then(() => {
        if (!cancelled) setRendering(false);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "RenderingCancelledException") console.error(error);
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pageNumber, pdf, scale]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function zoomBy(factor: number) {
    setFit(false);
    setScale((current) => Math.min(3, Math.max(0.4, current * factor)));
  }

  return (
    <div ref={frameRef} className="flex h-full min-h-0 flex-col bg-bg-raised">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-2 py-2">
        <button
          type="button"
          className="grid size-10 place-items-center rounded-full hover:bg-surface disabled:opacity-40"
          aria-label="Previous page"
          disabled={pageNumber <= 1}
          onClick={() => onPageChange(pageNumber - 1)}
        >
          <ChevronLeft className="size-5" />
        </button>
        {editingPage ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const next = Number(data.get("page"));
              if (Number.isFinite(next)) onPageChange(Math.min(pageCount, Math.max(1, next)));
              setEditingPage(false);
            }}
          >
            <label className="sr-only" htmlFor="page-number">
              Page number
            </label>
            <input
              id="page-number"
              name="page"
              type="number"
              min={1}
              max={pageCount}
              defaultValue={pageNumber}
              autoFocus
              className="h-9 w-24 rounded-md border border-line bg-surface px-2 text-center"
              onBlur={() => setEditingPage(false)}
            />
          </form>
        ) : (
          <button
            type="button"
            className="h-9 shrink-0 rounded-md px-2 text-sm whitespace-nowrap"
            onClick={() => setEditingPage(true)}
          >
            Page {pageNumber} / {pageCount}
          </button>
        )}
        <button
          type="button"
          className="grid size-10 place-items-center rounded-full hover:bg-surface disabled:opacity-40"
          aria-label="Next page"
          disabled={pageNumber >= pageCount}
          onClick={() => onPageChange(pageNumber + 1)}
        >
          <ChevronRight className="size-5" />
        </button>
        <div className="ml-auto flex shrink-0 items-center">
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full hover:bg-surface"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.15)}
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            className={cn("h-9 rounded-full px-2 text-sm", fit && "bg-surface")}
            onClick={() => setFit(true)}
          >
            Fit
          </button>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full hover:bg-surface"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.15)}
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full hover:bg-surface"
            aria-label={searchOpen ? "Close search" : "Search"}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
          </button>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full hover:bg-surface"
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void frameRef.current?.requestFullscreen();
            }}
          >
            {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
        </div>
      </div>
      {searchOpen ? (
        <form
          className="flex items-center gap-2 border-b border-line px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            onNextMatch();
          }}
        >
          <label className="sr-only" htmlFor="pdf-search">
            Search in document
          </label>
          <input
            id="pdf-search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search"
            className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm"
          />
          <span className="text-xs text-faint">{matchLabel}</span>
          <button type="button" className="h-9 px-2 text-sm" onClick={onPreviousMatch} aria-label="Previous match">
            Prev
          </button>
          <button type="submit" className="h-9 px-2 text-sm" aria-label="Next match">
            Next
          </button>
        </form>
      ) : null}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto w-fit">
          <canvas
            ref={canvasRef}
            className={cn("bg-white shadow-[var(--shadow)]", rendering && "opacity-70")}
          />
        </div>
      </div>
    </div>
  );
}
