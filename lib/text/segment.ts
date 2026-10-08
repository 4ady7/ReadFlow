import { cleanText, isSpeakable } from "@/lib/text/clean";

const TITLES = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "dr",
  "prof",
  "sr",
  "jr",
  "rev",
  "hon",
  "gen",
  "rep",
  "sen",
  "gov",
  "lt",
  "col",
  "sgt",
  "capt",
  "pres",
  "fr",
  "esq",
]);

const CONTINUING = new Set([
  "st",
  "ave",
  "blvd",
  "rd",
  "inc",
  "ltd",
  "co",
  "corp",
  "etc",
  "al",
  "eg",
  "ie",
  "fig",
  "vol",
  "no",
  "pp",
  "vs",
  "mt",
  "ft",
  "dept",
  "est",
  "approx",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
  "ed",
  "eds",
  "ph",
  "cf",
  "ca",
  "esp",
  "viz",
  "eq",
  "sec",
  "chap",
  "ch",
  "us",
  "uk",
  "un",
  "eu",
  "am",
  "pm",
  "md",
  "ba",
  "ma",
  "phd",
  "llb",
  "op",
  "cit",
  "ibid",
  "trans",
  "nos",
  "pg",
  "pgs",
  "govt",
  "bros",
  "assn",
  "univ",
]);

const SENTENCE_STARTERS = new Set([
  "The",
  "They",
  "He",
  "She",
  "It",
  "This",
  "That",
  "Then",
  "And",
  "But",
  "When",
  "After",
  "Before",
  "However",
  "We",
  "I",
  "You",
  "There",
  "Their",
  "His",
  "Her",
  "If",
  "So",
  "Or",
  "Not",
  "A",
  "An",
  "In",
  "On",
  "At",
  "For",
  "To",
  "Of",
  "With",
  "As",
  "By",
  "From",
  "Next",
  "Later",
  "Soon",
  "Now",
  "Still",
  "Also",
  "These",
  "Those",
  "What",
  "Why",
  "How",
  "Where",
  "Who",
]);

function lastWord(before: string) {
  const match = before.match(/[\p{L}\p{N}]+$/u);
  return match?.[0] ?? "";
}

function nextWord(after: string) {
  const match = after.trimStart().match(/^["“'«(]*([\p{L}\p{N}]+)/u);
  return match?.[1] ?? "";
}

function suppressesPeriod(word: string, after: string) {
  if (word.length === 1) return true;
  const lower = word.toLowerCase();
  if (TITLES.has(lower)) return true;
  if (!CONTINUING.has(lower)) return false;
  const upcoming = nextWord(after);
  if (SENTENCE_STARTERS.has(upcoming)) return false;
  return true;
}

function consumeClosing(text: string, index: number) {
  let end = index;
  while (end < text.length && /["”’')\]]/u.test(text[end] ?? "")) end += 1;
  return end;
}

function pushSentence(sentences: string[], text: string, start: number, end: number) {
  const sentence = text.slice(start, end).trim();
  if (sentence && isSpeakable(sentence)) sentences.push(sentence);
}

/**
 * Splits prose into sentences without breaking abbreviations, initials,
 * decimals, or list markers. Headings without punctuation stay intact.
 */
export function splitSentences(input: string) {
  const text = cleanText(input).replace(/\s+/g, " ");
  if (!text) return [];

  const sentences: string[] = [];
  let start = 0;

  const boundary = (markEnd: number) => {
    let end = consumeClosing(text, markEnd);
    const rest = text.slice(end);
    if (rest.length > 0 && !/^\s/u.test(rest)) return false;
    const upcoming = rest.trimStart();
    if (
      upcoming &&
      !/^[\p{Lu}\p{N}"“'«(]/u.test(upcoming) &&
      !/^[\u3000-\u30ff\u4e00-\u9fff]/u.test(upcoming)
    ) {
      return false;
    }
    pushSentence(sentences, text, start, end);
    while (end < text.length && /\s/u.test(text[end] ?? "")) end += 1;
    start = end;
    return end;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!char) continue;

    if (char === "…" || text.startsWith("...", index)) {
      const markEnd = char === "…" ? index + 1 : index + 3;
      const moved = boundary(markEnd);
      if (typeof moved === "number") index = moved - 1;
      else if (char !== "…") index += 2;
      continue;
    }

    if ("。！？!?".includes(char)) {
      const moved = boundary(index + 1);
      if (typeof moved === "number") index = moved - 1;
      continue;
    }

    if (char !== ".") continue;
    if (index > 0 && /\d/u.test(text[index - 1] ?? "") && /\d/u.test(text[index + 1] ?? "")) {
      continue;
    }

    const before = text.slice(start, index);
    const word = lastWord(before);
    if (/^\d+$/u.test(word) && before.trim() === word) continue;
    if (suppressesPeriod(word, text.slice(index + 1))) continue;

    const moved = boundary(index + 1);
    if (typeof moved === "number") index = moved - 1;
  }

  pushSentence(sentences, text, start, text.length);
  return sentences;
}
