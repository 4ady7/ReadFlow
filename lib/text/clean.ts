export function cleanText(input: string) {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\u00ad/g, "")
    .replace(/[\u2010\u2011]/g, "-")
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\uFB00/g, "ff")
    .replace(/\uFB03/g, "ffi")
    .replace(/\uFB04/g, "ffl")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

export function isSpeakable(text: string) {
  return /[\p{L}\p{N}]/u.test(text);
}

export function normalizeKey(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
