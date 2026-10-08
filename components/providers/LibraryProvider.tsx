"use client";

import {
  deleteDocument,
  listDocuments,
  saveNewDocument,
  updateDocument,
} from "@/lib/storage/db";
import type { LibraryDocument } from "@/types/reading";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface LibraryValue {
  documents: LibraryDocument[];
  ready: boolean;
  addFile: (id: string, file: File) => Promise<LibraryDocument>;
  remove: (id: string) => Promise<void>;
  patch: (id: string, update: Partial<LibraryDocument>) => Promise<void>;
  refresh: () => Promise<void>;
}

const LibraryContext = createContext<LibraryValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const next = await listDocuments();
    setDocuments(next);
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listDocuments()
      .then((next) => {
        if (cancelled) return;
        setDocuments(next);
        setReady(true);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<LibraryValue>(
    () => ({
      documents,
      ready,
      refresh,
      addFile: async (id, file) => {
        const document = await saveNewDocument(id, file);
        setDocuments((current) => [document, ...current.filter((item) => item.id !== id)]);
        return document;
      },
      remove: async (id) => {
        await deleteDocument(id);
        setDocuments((current) => current.filter((item) => item.id !== id));
      },
      patch: async (id, update) => {
        const next = await updateDocument(id, update);
        if (!next) return;
        setDocuments((current) => current.map((item) => (item.id === id ? next : item)));
      },
    }),
    [documents, ready, refresh],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("Library is unavailable.");
  return value;
}
