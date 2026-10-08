import { PdfPasswordError } from "@/lib/pdf/validate";
import type { PDFDocumentProxy } from "pdfjs-dist";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export async function openPdf(data: ArrayBuffer, password?: string) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    password,
    useSystemFonts: true,
    enableXfa: false,
    cMapUrl: "/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/standard_fonts/",
    wasmUrl: "/wasm/",
    verbosity: 0,
  });

  try {
    const pdf = await task.promise;
    return {
      pdf,
      destroy: () => {
        void task.destroy();
      },
    };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException" || code === 1 || code === 2) {
      const incorrect = code === pdfjs.PasswordResponses.INCORRECT_PASSWORD || code === 2;
      throw new PdfPasswordError(incorrect && Boolean(password));
    }
    throw error;
  }
}

export async function renderThumbnail(pdf: PDFDocumentProxy) {
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = 180 / base.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) return null;
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.72);
  });
}
