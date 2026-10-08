export const EXTRACTOR_VERSION = 1;

export type ParagraphRole =
  | "body"
  | "heading"
  | "list"
  | "quote"
  | "caption"
  | "footnote";

export type SentenceKind =
  | "sentence"
  | "heading"
  | "list-item"
  | "quote"
  | "caption"
  | "footnote";

export interface Sentence {
  id: string;
  index: number;
  pageNumber: number;
  paragraphId: string;
  text: string;
  kind: SentenceKind;
}

export interface Paragraph {
  id: string;
  pageNumber: number;
  sentenceStart: number;
  sentenceEnd: number;
  role: ParagraphRole;
}

export interface PageSpan {
  pageNumber: number;
  sentenceStart: number;
  sentenceEnd: number;
}

export interface Extraction {
  title: string | null;
  language: string;
  scanned: boolean;
  truncated: boolean;
  pageCount: number;
  notes: string[];
  sentences: Sentence[];
  paragraphs: Paragraph[];
  pages: PageSpan[];
}

export interface SpeechRange {
  sentenceIndex: number;
  start: number;
  end: number;
}

export interface SpeechChunk {
  id: string;
  sentences: Sentence[];
  spokenText: string;
  ranges: SpeechRange[];
}

export interface LibraryDocument {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  sentenceCount: number;
  addedAt: number;
  lastOpenedAt: number;
  progress: number;
  currentSentenceIndex: number;
  currentPage: number;
  language: string;
  title: string | null;
  hasText: boolean;
  scanned: boolean;
  thumbnail: Blob | null;
}

export type ReadScope =
  | { type: "from-here" }
  | { type: "sentence" }
  | { type: "paragraph" }
  | { type: "page" }
  | { type: "document" }
  | { type: "pages"; from: number; to: number };

export type PlaybackStatus =
  | "idle"
  | "preparing"
  | "playing"
  | "paused"
  | "ended"
  | "error";

export interface PlaybackSnapshot {
  status: PlaybackStatus;
  documentId: string | null;
  documentName: string;
  sentenceIndex: number;
  sentenceCount: number;
  pageNumber: number;
  pageCount: number;
  progress: number;
  rangeStart: number;
  rangeEnd: number;
  rangeProgress: number;
  currentText: string;
  scopeLabel: string;
  error: string | null;
  preparingDetail: string | null;
  endedDocument: boolean;
  rate: number;
  volume: number;
  pitch: number;
  scanned: boolean;
  hasText: boolean;
  language: string;
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export const EMPTY_SNAPSHOT: PlaybackSnapshot = {
  status: "idle",
  documentId: null,
  documentName: "",
  sentenceIndex: 0,
  sentenceCount: 0,
  pageNumber: 1,
  pageCount: 0,
  progress: 0,
  rangeStart: 0,
  rangeEnd: 0,
  rangeProgress: 0,
  currentText: "",
  scopeLabel: "From here",
  error: null,
  preparingDetail: null,
  endedDocument: false,
  rate: 1,
  volume: 1,
  pitch: 1,
  scanned: false,
  hasText: false,
  language: "en-US",
};
