import type { Paragraph, ReadScope, Sentence } from "@/types/reading";

export function resolveScope(
  sentences: Sentence[],
  paragraphs: Paragraph[],
  scope: ReadScope,
  cursor: number,
) {
  if (!sentences.length) return null;
  const last = sentences.length - 1;
  const current = sentences[Math.min(Math.max(cursor, 0), last)];
  if (!current) return null;

  switch (scope.type) {
    case "from-here":
      return { start: current.index, end: last, label: "From here" };
    case "document":
      return { start: 0, end: last, label: "Document" };
    case "sentence":
      return { start: current.index, end: current.index, label: "This sentence" };
    case "paragraph": {
      const paragraph = paragraphs.find((item) => item.id === current.paragraphId);
      if (!paragraph) return { start: current.index, end: current.index, label: "This paragraph" };
      return {
        start: paragraph.sentenceStart,
        end: Math.max(paragraph.sentenceStart, paragraph.sentenceEnd - 1),
        label: "This paragraph",
      };
    }
    case "page": {
      const onPage = sentences.filter((sentence) => sentence.pageNumber === current.pageNumber);
      const first = onPage[0];
      const end = onPage[onPage.length - 1];
      if (!first || !end) return null;
      return { start: first.index, end: end.index, label: `Page ${current.pageNumber}` };
    }
    case "pages": {
      const from = Math.min(scope.from, scope.to);
      const to = Math.max(scope.from, scope.to);
      const onPages = sentences.filter(
        (sentence) => sentence.pageNumber >= from && sentence.pageNumber <= to,
      );
      const first = onPages[0];
      const end = onPages[onPages.length - 1];
      if (!first || !end) return null;
      return {
        start: first.index,
        end: end.index,
        label: from === to ? `Page ${from}` : `Pages ${from}–${to}`,
      };
    }
    default:
      return null;
  }
}
