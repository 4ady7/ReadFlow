"use client";

import dynamic from "next/dynamic";

const ReaderApp = dynamic(() => import("@/components/reader/ReaderApp").then((mod) => mod.ReaderApp), {
  ssr: false,
  loading: () => (
    <div className="grid h-dvh place-items-center bg-bg text-muted">
      <p>Opening reader…</p>
    </div>
  ),
});

export function ReaderScreen({ id }: { id: string }) {
  return <ReaderApp id={id} />;
}
