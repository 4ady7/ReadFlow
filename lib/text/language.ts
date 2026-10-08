const WORD_LISTS: Record<string, string[]> = {
  en: ["the", "and", "of", "to", "in", "is", "that", "for", "with", "this"],
  es: ["el", "la", "de", "que", "en", "los", "del", "las", "una", "por"],
  fr: ["le", "la", "les", "des", "une", "est", "que", "dans", "pour", "pas"],
  de: ["der", "die", "und", "den", "das", "von", "ist", "nicht", "ein", "mit"],
  it: ["che", "non", "della", "una", "per", "del", "sono", "come", "piu", "questo"],
  pt: ["que", "não", "nao", "uma", "para", "com", "dos", "das", "uma", "em"],
  nl: ["het", "een", "van", "dat", "niet", "voor", "met", "zijn", "aan", "ook"],
};

const TAGS: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-BR",
  nl: "nl-NL",
  ja: "ja-JP",
  zh: "zh-CN",
  ko: "ko-KR",
};

export const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Match the document" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "it-IT", label: "Italian" },
  { value: "pt-BR", label: "Portuguese" },
  { value: "nl-NL", label: "Dutch" },
  { value: "ja-JP", label: "Japanese" },
  { value: "zh-CN", label: "Chinese" },
  { value: "ko-KR", label: "Korean" },
] as const;

export function detectLanguage(text: string) {
  const sample = text.slice(0, 6000);
  if (/[\u3040-\u30ff]/u.test(sample)) return "ja-JP";
  if (/[\uac00-\ud7af]/u.test(sample)) return "ko-KR";
  if (/[\u4e00-\u9fff]/u.test(sample)) return "zh-CN";

  const words = sample.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  if (words.length < 8) return "en-US";

  let best = "en";
  let bestScore = 0;
  for (const [lang, list] of Object.entries(WORD_LISTS)) {
    const lexicon = new Set(list);
    let score = 0;
    for (const word of words) {
      if (lexicon.has(word)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }
  return TAGS[best] ?? "en-US";
}
