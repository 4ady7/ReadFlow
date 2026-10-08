"use client";

import { Button } from "@/components/ui/button";
import { useLibrary } from "@/components/providers/LibraryProvider";
import { assertPdfMagic, validatePdfFile } from "@/lib/pdf/validate";
import { cn } from "@/lib/utils";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

export function Dropzone() {
  const inputId = useId();
  const router = useRouter();
  const { addFile } = useLibrary();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function takeFile(file: File | undefined) {
    if (!file || busy) return;
    const invalid = validatePdfFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await assertPdfMagic(file);
      const id = crypto.randomUUID();
      await addFile(id, file);
      router.push(`/read/${id}`);
    } catch (reason) {
      console.error(reason);
      setError(reason instanceof Error ? reason.message : "This PDF couldn't be saved.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <div
        className={cn(
          "rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center shadow-[var(--shadow)] transition",
          over && "border-ink bg-bg-raised",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          void takeFile(event.dataTransfer.files[0]);
        }}
      >
        <Upload className="mx-auto size-6 text-muted" aria-hidden="true" />
        <p className="mt-4 font-serif text-3xl tracking-tight">Drop a PDF here</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">
          Then press play. ReadFlow prepares the text and keeps reading while you listen.
        </p>
        <div className="mt-6">
          <input
            id={inputId}
            className="sr-only"
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void takeFile(file);
            }}
          />
          <Button size="lg" disabled={busy} onClick={() => document.getElementById(inputId)?.click()}>
            {busy ? "Opening…" : "Browse files"}
          </Button>
        </div>
        <p className="mt-5 text-xs text-faint">Up to 80 MB. Your PDFs stay on this device.</p>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
