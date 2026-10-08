import { splitSentences } from "../lib/text/segment.ts";
import { buildSpeechChunks } from "../lib/text/chunks.ts";
import type { Sentence } from "../types/reading.ts";

const cases: [string, string[]][] = [
  [
    "Dr. Smith arrived at 3.14 with the U.S. team. He smiled.",
    ["Dr. Smith arrived at 3.14 with the U.S. team.", "He smiled."],
  ],
  ["See Fig. 2 for details. It matters.", ["See Fig. 2 for details.", "It matters."]],
  [
    "Mr. and Mrs. Jones live on St. James St. They wave.",
    ["Mr. and Mrs. Jones live on St. James St.", "They wave."],
  ],
  ['"Wait," she said. "Not yet."', ['"Wait," she said.', '"Not yet."']],
  ["J. K. Rowling wrote novels. She is famous.", ["J. K. Rowling wrote novels.", "She is famous."]],
  ["e.g. this one. And another.", ["e.g. this one.", "And another."]],
  ["Chapter 1", ["Chapter 1"]],
  ["Hello world! How are you? Fine.", ["Hello world!", "How are you?", "Fine."]],
  ["3. The next item continues here.", ["3. The next item continues here."]],
];

let failed = 0;
for (const [input, expected] of cases) {
  const actual = splitSentences(input);
  const same = actual.length === expected.length && actual.every((sentence, index) => sentence === expected[index]);
  if (!same) {
    failed += 1;
    console.error("FAIL", JSON.stringify(input));
    console.error(" expected", expected);
    console.error(" actual  ", actual);
  }
}

const sentences: Sentence[] = splitSentences(
  "The first sentence is calm. The second sentence continues the thought. A heading should stand apart.",
).map((text, index) => ({
  id: `s${index}`,
  index,
  pageNumber: 1,
  paragraphId: index === 2 ? "p2" : "p1",
  text,
  kind: index === 2 ? "heading" : "sentence",
}));
const chunks = buildSpeechChunks(sentences, 80);
if (!chunks.length || chunks.some((chunk) => !chunk.spokenText.trim())) {
  failed += 1;
  console.error("chunks failed", chunks);
}
console.log(failed ? `${failed} failed` : "text checks passed");
process.exit(failed ? 1 : 0);
