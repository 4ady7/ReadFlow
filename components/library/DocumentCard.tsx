"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { usePlayback } from "@/components/providers/PlaybackProvider";
import { formatOpened, formatPercent } from "@/lib/utils";
import type { LibraryDocument } from "@/types/reading";
import { BookOpen, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export function DocumentCard({ document }: { document: LibraryDocument }) {
  const { remove } = useLibrary();
  const playback = usePlayback();
  const [confirm, setConfirm] = useState(false);
  const preview = useMemo(
    () => (document.thumbnail ? URL.createObjectURL(document.thumbnail) : null),
    [document.thumbnail],
  );

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const progress = document.sentenceCount > 0 ? document.progress : 0;
  const action =
    progress >= 0.995 ? "Read again" : progress > 0.01 ? "Continue reading" : "Start reading";

  return (
    <article className="flex gap-4 rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow)]">
      <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-bg-raised">
        {preview ? (
          // Blob thumbnails are created locally and cannot go through the image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-faint">
            <BookOpen className="size-5" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium">{document.title || document.name}</h3>
        <p className="mt-1 text-sm text-muted">
          {document.pageCount > 0
            ? `${Math.max(1, document.currentPage)} / ${document.pageCount} pages`
            : "Not opened yet"}
        </p>
        {document.pageCount > 0 ? (
          <div className="mt-3">
            <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div className="h-full bg-accent" style={{ width: formatPercent(progress) }} />
            </div>
            <p className="mt-1 text-xs text-faint">
              {formatPercent(progress)} completed · {formatOpened(document.lastOpenedAt)}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-faint">{formatOpened(document.addedAt)}</p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Link
            href={`/read/${document.id}`}
            className="inline-flex h-9 items-center rounded-full bg-ink px-3 text-sm font-medium text-bg"
          >
            {action}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete ${document.name}`}
            onClick={() => setConfirm(true)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <Dialog
        open={confirm}
        title="Delete this PDF?"
        description="It will be removed from this device. The original file is left untouched."
        onClose={() => setConfirm(false)}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="bg-danger text-white"
            onClick={() => {
              if (playback.snapshot.documentId === document.id) playback.clear();
              void remove(document.id);
              setConfirm(false);
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </article>
  );
}
