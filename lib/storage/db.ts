import type { Extraction, LibraryDocument } from "@/types/reading";
import { EXTRACTOR_VERSION } from "@/types/reading";

const DB_NAME = "readflow";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("documents")) {
        db.createObjectStore("documents", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("extractions")) {
        db.createObjectStore("extractions", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("audio")) {
        db.createObjectStore("audio", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open storage."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Storage failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Storage was cancelled."));
  });
}

export async function listDocuments() {
  const db = await openDatabase();
  const transaction = db.transaction("documents", "readonly");
  const request = transaction.objectStore("documents").getAll();
  const documents = await new Promise<LibraryDocument[]>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as LibraryDocument[]) ?? []);
    request.onerror = () => reject(request.error);
  });
  await transactionDone(transaction);
  return documents.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export async function getDocument(id: string) {
  const db = await openDatabase();
  const transaction = db.transaction("documents", "readonly");
  const request = transaction.objectStore("documents").get(id);
  const document = await new Promise<LibraryDocument | null>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as LibraryDocument | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  await transactionDone(transaction);
  return document;
}

export async function getFile(id: string) {
  const db = await openDatabase();
  const transaction = db.transaction("files", "readonly");
  const request = transaction.objectStore("files").get(id);
  const record = await new Promise<{ id: string; data: ArrayBuffer } | null>((resolve, reject) => {
    request.onsuccess = () =>
      resolve((request.result as { id: string; data: ArrayBuffer } | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  await transactionDone(transaction);
  if (!record?.data) throw new Error("This document is no longer saved on this device.");
  return record.data;
}

export async function saveNewDocument(id: string, file: File) {
  const now = Date.now();
  const document: LibraryDocument = {
    id,
    name: file.name || "Untitled.pdf",
    size: file.size,
    pageCount: 0,
    sentenceCount: 0,
    addedAt: now,
    lastOpenedAt: now,
    progress: 0,
    currentSentenceIndex: 0,
    currentPage: 1,
    language: "en-US",
    title: null,
    hasText: true,
    scanned: false,
    thumbnail: null,
  };
  const data = await file.arrayBuffer();
  const db = await openDatabase();
  const transaction = db.transaction(["documents", "files"], "readwrite");
  transaction.objectStore("documents").put(document);
  transaction.objectStore("files").put({ id, data });
  await transactionDone(transaction);
  return document;
}

export async function updateDocument(id: string, patch: Partial<LibraryDocument>) {
  const current = await getDocument(id);
  if (!current) return null;
  const next = { ...current, ...patch, id };
  const db = await openDatabase();
  const transaction = db.transaction("documents", "readwrite");
  transaction.objectStore("documents").put(next);
  await transactionDone(transaction);
  return next;
}

export async function deleteDocument(id: string) {
  const db = await openDatabase();
  const transaction = db.transaction(["documents", "files", "extractions"], "readwrite");
  transaction.objectStore("documents").delete(id);
  transaction.objectStore("files").delete(id);
  transaction.objectStore("extractions").delete(id);
  await transactionDone(transaction);
}

interface StoredExtraction {
  id: string;
  version: number;
  data: Extraction;
}

export async function getExtraction(id: string) {
  const db = await openDatabase();
  const transaction = db.transaction("extractions", "readonly");
  const request = transaction.objectStore("extractions").get(id);
  const record = await new Promise<StoredExtraction | null>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as StoredExtraction | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  await transactionDone(transaction);
  if (!record || record.version !== EXTRACTOR_VERSION) return null;
  return record.data;
}

export async function saveExtraction(id: string, data: Extraction) {
  const db = await openDatabase();
  const transaction = db.transaction("extractions", "readwrite");
  transaction.objectStore("extractions").put({ id, version: EXTRACTOR_VERSION, data });
  await transactionDone(transaction);
}

interface AudioRecord {
  key: string;
  data: ArrayBuffer;
  createdAt: number;
}

export async function getCachedAudio(key: string) {
  const db = await openDatabase();
  const transaction = db.transaction("audio", "readonly");
  const request = transaction.objectStore("audio").get(key);
  const record = await new Promise<AudioRecord | null>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as AudioRecord | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  await transactionDone(transaction);
  return record?.data ?? null;
}

export async function putCachedAudio(key: string, data: ArrayBuffer) {
  const db = await openDatabase();
  const transaction = db.transaction("audio", "readwrite");
  const store = transaction.objectStore("audio");
  store.put({ key, data, createdAt: Date.now() } satisfies AudioRecord);
  const countRequest = store.count();
  const count = await new Promise<number>((resolve) => {
    countRequest.onsuccess = () => resolve(countRequest.result);
    countRequest.onerror = () => resolve(0);
  });
  if (count > 280) {
    const allRequest = store.getAll();
    const records = await new Promise<AudioRecord[]>((resolve) => {
      allRequest.onsuccess = () => resolve((allRequest.result as AudioRecord[]) ?? []);
      allRequest.onerror = () => resolve([]);
    });
    records
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 40)
      .forEach((record) => store.delete(record.key));
  }
  await transactionDone(transaction);
}
