import type { Sentence, SpeechChunk } from "@/types/reading";

export function spokenForm(sentence: Sentence) {
  let text = sentence.text.replace(/\s+/g, " ").trim();
  const needsPause =
    sentence.kind === "heading" ||
    sentence.kind === "list-item" ||
    sentence.kind === "caption";
  if (needsPause && !/[.!?…:;"”’]$/u.test(text)) text = `${text}.`;
  return text;
}

function makeChunk(sentences: Sentence[], id: string): SpeechChunk {
  const pieces: string[] = [];
  const ranges: SpeechChunk["ranges"] = [];
  let cursor = 0;
  sentences.forEach((sentence, index) => {
    const text = spokenForm(sentence);
    const start = cursor;
    pieces.push(text);
    cursor += text.length;
    ranges.push({ sentenceIndex: sentence.index, start, end: cursor });
    if (index < sentences.length - 1) cursor += 1;
  });
  return {
    id,
    sentences,
    spokenText: pieces.join(" "),
    ranges,
  };
}

function splitLongSentence(sentence: Sentence, maxChars: number) {
  const text = spokenForm(sentence);
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const breaks = ["; ", " — ", " – ", ", "];
    let cut = -1;
    for (const marker of breaks) {
      const at = window.lastIndexOf(marker);
      if (at > maxChars * 0.4) {
        cut = at + marker.length;
        break;
      }
    }
    if (cut < 0) {
      const space = window.lastIndexOf(" ");
      cut = space > maxChars * 0.4 ? space + 1 : maxChars;
    }
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.map((part, index) =>
    makeChunk(
      [{ ...sentence, text: part.replace(/\.$/u, sentence.text.endsWith(".") ? "." : "") }],
      `${sentence.id}-part-${index}`,
    ),
  );
}

export function buildSpeechChunks(sentences: Sentence[], maxChars: number) {
  const chunks: SpeechChunk[] = [];
  let buffer: Sentence[] = [];

  const lengthOf = (items: Sentence[]) =>
    items.reduce((total, sentence, index) => {
      return total + spokenForm(sentence).length + (index > 0 ? 1 : 0);
    }, 0);

  const flush = () => {
    if (!buffer.length) return;
    const first = buffer[0];
    const last = buffer[buffer.length - 1];
    if (!first || !last) return;
    chunks.push(makeChunk(buffer, `c-${first.index}-${last.index}`));
    buffer = [];
  };

  for (const sentence of sentences) {
    const spoken = spokenForm(sentence);
    if (spoken.length > maxChars) {
      flush();
      chunks.push(...splitLongSentence(sentence, maxChars));
      continue;
    }

    const previous = buffer[buffer.length - 1];
    const projected = lengthOf(buffer) + (buffer.length ? 1 : 0) + spoken.length;
    const paragraphBreak = Boolean(previous && previous.paragraphId !== sentence.paragraphId);
    const headingStarts = sentence.kind === "heading" && buffer.length > 0;
    const enough = lengthOf(buffer) >= Math.min(160, Math.floor(maxChars * 0.45));
    if (buffer.length && (projected > maxChars || headingStarts || (paragraphBreak && enough))) {
      flush();
    }
    buffer.push(sentence);
  }
  flush();
  return chunks;
}

/** Speaks the first sentence quickly, then the rest of that group. */
export function withFastStart(chunks: SpeechChunk[]) {
  const first = chunks[0];
  if (!first || first.sentences.length < 2 || first.spokenText.length < 200) return chunks;
  const [head, ...tail] = first.sentences;
  if (!head) return chunks;
  return [
    makeChunk([head], `${first.id}-a`),
    makeChunk(tail, `${first.id}-b`),
    ...chunks.slice(1),
  ];
}

export function sentenceIndexAtChar(chunk: SpeechChunk, charIndex: number) {
  for (const range of chunk.ranges) {
    if (charIndex < range.end) return range.sentenceIndex;
  }
  return chunk.ranges[chunk.ranges.length - 1]?.sentenceIndex ?? chunk.sentences[0]?.index ?? 0;
}

export function timingsForChunk(chunk: SpeechChunk, duration: number) {
  const weights = chunk.ranges.map((range) => Math.max(1, range.end - range.start));
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  let time = 0;
  return chunk.ranges.map((range, index) => {
    const start = time;
    time += duration * ((weights[index] ?? 1) / total);
    return { sentenceIndex: range.sentenceIndex, start, end: time };
  });
}

export function offsetForSentence(chunk: SpeechChunk, sentenceIndex: number, duration: number) {
  const timing = timingsForChunk(chunk, duration).find(
    (item) => item.sentenceIndex === sentenceIndex,
  );
  return timing?.start ?? 0;
}

export function sentenceAtOffset(chunk: SpeechChunk, offset: number, duration: number) {
  const timings = timingsForChunk(chunk, duration);
  const hit =
    timings.find((item) => offset >= item.start && offset < item.end - 0.0001) ??
    timings[timings.length - 1];
  return hit?.sentenceIndex ?? chunk.sentences[0]?.index ?? 0;
}
