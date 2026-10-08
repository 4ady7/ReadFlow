"use client";

import { cn } from "@/lib/utils";
import { useEffect, useId, useRef, type ReactNode } from "react";

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        "w-[min(100%,32rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow)]",
        wide && "w-[min(100%,40rem)]",
      )}
      onClose={onClose}
      onMouseDown={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="px-5 py-4">
        <h2 id={titleId} className="font-serif text-2xl tracking-tight">
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="mt-1 text-sm text-muted">
            {description}
          </p>
        ) : null}
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}
