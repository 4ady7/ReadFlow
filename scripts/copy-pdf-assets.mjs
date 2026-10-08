import { cpSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pdfjs = path.dirname(require.resolve("pdfjs-dist/package.json"));
const publicDir = path.join(root, "public");

mkdirSync(publicDir, { recursive: true });

cpSync(
  path.join(pdfjs, "build", "pdf.worker.min.mjs"),
  path.join(publicDir, "pdf.worker.min.mjs"),
);

for (const folder of ["standard_fonts", "cmaps", "wasm"]) {
  const dest = path.join(publicDir, folder);
  rmSync(dest, { recursive: true, force: true });
  cpSync(path.join(pdfjs, folder), dest, { recursive: true });
}

console.log("Copied PDF.js worker, fonts, cmaps, and wasm into public/");
