import { cleanText, isSpeakable, normalizeKey } from "@/lib/text/clean";
import { detectLanguage } from "@/lib/text/language";
import { splitSentences } from "@/lib/text/segment";
import { yieldToMain } from "@/lib/utils";
import type {
  Extraction,
  PageSpan,
  Paragraph,
  ParagraphRole,
  Sentence,
  SentenceKind,
} from "@/types/reading";
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";

const MAX_PAGES = 2500;

interface Glyph {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  dir: string;
}

interface Line {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  height: number;
  pageNumber: number;
  pageHeight: number;
}

interface Block {
  text: string;
  pageNumber: number;
  fontSize: number;
  y: number;
  pageHeight: number;
  role: ParagraphRole;
}

function median(values: number[]) {
  if (!values.length) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 12;
}

function isTextItem(item: unknown): item is TextItem {
  return typeof item === "object" && item !== null && "str" in item && "transform" in item;
}

function glyphsFromItems(items: unknown[]): Glyph[] {
  const glyphs: Glyph[] = [];
  for (const item of items) {
    if (!isTextItem(item)) continue;
    const raw = item.str.replace(/\u00ad/g, "");
    if (!raw.trim()) continue;
    const transform = item.transform as number[];
    const fontSize = Math.hypot(transform[2] ?? 0, transform[3] ?? 0) || item.height || 12;
    glyphs.push({
      str: raw,
      x: transform[4] ?? 0,
      y: transform[5] ?? 0,
      width: item.width || raw.length * fontSize * 0.45,
      height: item.height || fontSize,
      fontSize,
      dir: item.dir,
    });
  }
  return glyphs;
}

function columnGroups(glyphs: Glyph[], pageWidth: number) {
  if (glyphs.length < 12 || pageWidth <= 0) return [glyphs];
  const bins = 48;
  const binWidth = pageWidth / bins;
  const weight = new Array<number>(bins).fill(0);
  for (const glyph of glyphs) {
    const bin = Math.min(bins - 1, Math.max(0, Math.floor(glyph.x / binWidth)));
    weight[bin] = (weight[bin] ?? 0) + Math.max(glyph.width, 1);
  }
  const total = weight.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [glyphs];
  let best = -1;
  let bestWeight = Infinity;
  const low = Math.floor(bins * 0.28);
  const high = Math.floor(bins * 0.72);
  for (let index = low; index <= high; index += 1) {
    const value = weight[index] ?? 0;
    if (value < bestWeight) {
      bestWeight = value;
      best = index;
    }
  }
  const left = weight.slice(0, best).reduce((sum, value) => sum + value, 0);
  const right = weight.slice(best + 1).reduce((sum, value) => sum + value, 0);
  if (bestWeight / total < 0.015 && left / total > 0.22 && right / total > 0.22) {
    const gutter = (best + 0.5) * binWidth;
    const leftGlyphs = glyphs.filter((glyph) => glyph.x + glyph.width * 0.5 < gutter);
    const rightGlyphs = glyphs.filter((glyph) => glyph.x + glyph.width * 0.5 >= gutter);
    if (leftGlyphs.length && rightGlyphs.length) return [leftGlyphs, rightGlyphs];
  }
  return [glyphs];
}

function linesFromGlyphs(glyphs: Glyph[], pageNumber: number, pageHeight: number) {
  const sorted = [...glyphs].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: Glyph[][] = [];
  for (const glyph of sorted) {
    const group = groups.find((candidate) => {
      const anchor = candidate[0];
      if (!anchor) return false;
      return Math.abs(anchor.y - glyph.y) < Math.max(2, Math.min(anchor.height, glyph.height) * 0.45);
    });
    if (group) group.push(glyph);
    else groups.push([glyph]);
  }

  return groups
    .map((group) => {
      const rtl = group.filter((glyph) => glyph.dir === "rtl").length > group.length / 2;
      group.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
      let text = "";
      let endX = rtl ? Number.POSITIVE_INFINITY : 0;
      let minX = Number.POSITIVE_INFINITY;
      let fontSize = 0;
      let height = 0;
      let y = 0;
      for (const glyph of group) {
        const gap = rtl ? endX - (glyph.x + glyph.width) : glyph.x - endX;
        if (text && gap > Math.max(glyph.fontSize * 0.22, 1.5) && !text.endsWith(" ") && !glyph.str.startsWith(" ")) {
          text += " ";
        }
        text += glyph.str;
        endX = rtl ? glyph.x : glyph.x + glyph.width;
        minX = Math.min(minX, glyph.x);
        fontSize = Math.max(fontSize, glyph.fontSize);
        height = Math.max(height, glyph.height);
        y = glyph.y;
      }
      const cleaned = cleanText(text);
      if (!cleaned) return null;
      return {
        text: cleaned,
        x: Number.isFinite(minX) ? minX : 0,
        y,
        fontSize: fontSize || 12,
        height: height || fontSize || 12,
        pageNumber,
        pageHeight,
      } satisfies Line;
    })
    .filter((line): line is Line => Boolean(line));
}

function isPageNumber(text: string) {
  const value = text.trim();
  return (
    /^(?:page\s+)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i.test(value) ||
    /^[ivxlcdm]{1,8}$/i.test(value) ||
    /^[-–—]\s*\d{1,4}\s*[-–—]$/.test(value)
  );
}

function inMargin(line: Line, edge: "top" | "bottom") {
  if (edge === "top") return line.y > line.pageHeight * 0.9;
  return line.y < line.pageHeight * 0.08;
}

function dehyphenate(lines: string[]) {
  let text = "";
  for (const line of lines) {
    const part = line.trim();
    if (!part) continue;
    if (!text) {
      text = part;
      continue;
    }
    if (/[A-Za-z]-$/u.test(text) && /^[a-z]/u.test(part)) text = text.slice(0, -1) + part;
    else text = `${text} ${part}`;
  }
  return cleanText(text);
}

function roleFor(block: Omit<Block, "role">, bodySize: number): ParagraphRole {
  const text = block.text;
  if (/^(?:figure|fig\.|table|caption)\b/i.test(text) && text.length < 280) return "caption";
  if (block.fontSize < bodySize * 0.82 && block.y < block.pageHeight * 0.2 && text.length < 500) {
    return "footnote";
  }
  if (/^(?:[-*•·▪‣]|\d{1,3}[.)]|[A-Za-z][.)])\s+\S/u.test(text)) return "list";
  if (block.fontSize > bodySize * 1.18 && text.length < 100) return "heading";
  if (/^[“"]/u.test(text)) return "quote";
  return "body";
}

function kindFor(role: ParagraphRole): SentenceKind {
  switch (role) {
    case "heading":
      return "heading";
    case "list":
      return "list-item";
    case "quote":
      return "quote";
    case "caption":
      return "caption";
    case "footnote":
      return "footnote";
    default:
      return "sentence";
  }
}

function blocksFromLines(lines: Line[], bodySize: number) {
  const blocks: Block[] = [];
  let current: Line[] = [];

  const flush = () => {
    if (!current.length) return;
    const first = current[0];
    if (!first) return;
    const text = dehyphenate(current.map((line) => line.text));
    const fontSize = median(current.map((line) => line.fontSize));
    const y = Math.min(...current.map((line) => line.y));
    if (isSpeakable(text)) {
      const draft = {
        text,
        pageNumber: first.pageNumber,
        fontSize,
        y,
        pageHeight: first.pageHeight,
      };
      blocks.push({ ...draft, role: roleFor(draft, bodySize) });
    }
    current = [];
  };

  for (const line of lines) {
    const previous = current[current.length - 1];
    if (!previous) {
      current.push(line);
      continue;
    }
    const gap = previous.y - line.y;
    const typical = Math.max(previous.height, line.height, 8) * 1.55;
    const fontJump = Math.abs(line.fontSize - previous.fontSize) > bodySize * 0.22;
    const indent = line.x - previous.x > 14 && gap > typical * 0.75;
    const listStart = /^(?:[-*•·▪‣]|\d{1,3}[.)])\s+/u.test(line.text);
    if (gap > typical || fontJump || indent || listStart) flush();
    current.push(line);
  }
  flush();
  return blocks;
}

export async function extractDocument(
  pdf: PDFDocumentProxy,
  onProgress?: (current: number, total: number) => void,
): Promise<Extraction> {
  const pageCount = pdf.numPages;
  const limited = Math.min(pageCount, MAX_PAGES);
  const notes: string[] = [];
  if (pageCount > MAX_PAGES) {
    notes.push(`Prepared the first ${MAX_PAGES.toLocaleString()} pages of this PDF.`);
  }

  const pages: { width: number; height: number; glyphs: Glyph[] }[] = [];
  for (let pageNumber = 1; pageNumber <= limited; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push({
      width: viewport.width,
      height: viewport.height,
      glyphs: glyphsFromItems(content.items),
    });
    onProgress?.(pageNumber, limited);
    if (pageNumber % 2 === 0) await yieldToMain();
  }

  const simpleLines = pages.map((page, index) =>
    linesFromGlyphs(page.glyphs, index + 1, page.height),
  );

  const headerCounts = new Map<string, number>();
  const footerCounts = new Map<string, number>();
  if (simpleLines.length >= 3) {
    for (const lines of simpleLines) {
      const top = lines.filter((line) => inMargin(line, "top")).slice(0, 2);
      const bottom = lines.filter((line) => inMargin(line, "bottom")).slice(-2);
      for (const line of top) {
        const key = normalizeKey(line.text);
        if (key && key.length < 90) headerCounts.set(key, (headerCounts.get(key) ?? 0) + 1);
      }
      for (const line of bottom) {
        const key = normalizeKey(line.text);
        if (key && key.length < 90) footerCounts.set(key, (footerCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const repeated = (counts: Map<string, number>) => {
    const bad = new Set<string>();
    const threshold = Math.max(3, Math.floor(simpleLines.length * 0.3));
    for (const [key, count] of counts) {
      if (count >= threshold) bad.add(key);
    }
    return bad;
  };
  const badHeaders = repeated(headerCounts);
  const badFooters = repeated(footerCounts);

  const fontSamples: number[] = [];
  const readingLines: Line[][] = pages.map((page, index) => {
    const ordered = columnGroups(page.glyphs, page.width).flatMap((group) =>
      linesFromGlyphs(group, index + 1, page.height),
    );
    return ordered.filter((line) => {
      const key = normalizeKey(line.text);
      if (!key || !isSpeakable(line.text)) return false;
      if (inMargin(line, "top") && (badHeaders.has(key) || isPageNumber(line.text))) return false;
      if (inMargin(line, "bottom") && (badFooters.has(key) || isPageNumber(line.text))) return false;
      fontSamples.push(line.fontSize);
      return true;
    });
  });

  const bodySize = median(fontSamples.filter((size) => size > 0));
  const sentences: Sentence[] = [];
  const paragraphs: Paragraph[] = [];

  readingLines.forEach((lines, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const blocks = blocksFromLines(lines, bodySize);
    const footnotes = blocks.filter((block) => block.role === "footnote");
    const body = blocks.filter((block) => block.role !== "footnote");
    for (const block of [...body, ...footnotes]) {
      const parts = block.role === "heading" || block.role === "list" || block.role === "caption"
        ? [block.text]
        : splitSentences(block.text);
      const speakable = parts.filter(isSpeakable);
      if (!speakable.length) continue;
      const paragraphId = `p${pageNumber}-${paragraphs.length}`;
      const sentenceStart = sentences.length;
      speakable.forEach((text) => {
        const index = sentences.length;
        sentences.push({
          id: `s${index}`,
          index,
          pageNumber,
          paragraphId,
          text,
          kind: kindFor(block.role),
        });
      });
      paragraphs.push({
        id: paragraphId,
        pageNumber,
        sentenceStart,
        sentenceEnd: sentences.length,
        role: block.role,
      });
    }
  });

  const pageSpans: PageSpan[] = [];
  let cursor = 0;
  for (let pageNumber = 1; pageNumber <= limited; pageNumber += 1) {
    const sentenceStart = cursor;
    while (cursor < sentences.length && sentences[cursor]?.pageNumber === pageNumber) cursor += 1;
    pageSpans.push({ pageNumber, sentenceStart, sentenceEnd: cursor });
  }

  const prose = sentences
    .filter((sentence) => sentence.kind !== "footnote")
    .slice(0, 80)
    .map((sentence) => sentence.text)
    .join(" ");
  const characters = sentences.reduce((total, sentence) => total + sentence.text.length, 0);
  const scanned = limited > 0 && characters < limited * 25;
  const title =
    sentences.find((sentence) => sentence.kind === "heading" && sentence.text.length < 140)?.text ??
    null;

  return {
    title,
    language: detectLanguage(prose),
    scanned,
    truncated: pageCount > limited,
    pageCount,
    notes,
    sentences: scanned ? [] : sentences,
    paragraphs: scanned ? [] : paragraphs,
    pages: scanned
      ? pageSpans.map((span) => ({ ...span, sentenceEnd: span.sentenceStart }))
      : pageSpans,
  };
}
