"use client";

import { usePlayback } from "@/components/providers/PlaybackProvider";
import { formatPercent } from "@/lib/utils";
import { Pause, Play } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function MiniPlayer() {
  const pathname = usePathname();
  const { snapshot, pause, resume, replay } = usePlayback();
  if (!snapshot.documentId || pathname.startsWith("/read/")) return null;

  const playing = snapshot.status === "playing" || snapshot.status === "preparing";
  const label =
    snapshot.status === "ended"
      ? snapshot.endedDocument
        ? "You've reached the end."
        : "Paused"
      : snapshot.currentText || "Ready to listen";

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <button
          type="button"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-ink text-bg"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (playing) pause();
            else if (snapshot.status === "paused" || snapshot.status === "error") resume();
            else if (snapshot.status === "ended") replay();
            else resume();
          }}
        >
          {playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
        </button>
        <Link href={`/read/${snapshot.documentId}`} className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{snapshot.documentName}</p>
          <p className="truncate text-sm text-muted">{label}</p>
        </Link>
        <p className="shrink-0 text-sm text-faint">{formatPercent(snapshot.progress)}</p>
      </div>
    </div>
  );
}
