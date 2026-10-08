export const MAX_PDF_BYTES = 80 * 1024 * 1024;

export function validatePdfFile(file: File) {
  if (file.size <= 0) return "This file is empty.";
  if (file.size > MAX_PDF_BYTES) return "This PDF is larger than 80 MB.";
  const looksLikePdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) return "Choose a PDF file.";
  return null;
}

export async function assertPdfMagic(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const signature = String.fromCharCode(...bytes);
  if (!signature.startsWith("%PDF-")) {
    throw new Error("This file doesn't look like a PDF.");
  }
}

export class PdfPasswordError extends Error {
  readonly incorrect: boolean;

  constructor(incorrect: boolean) {
    super(incorrect ? "That password didn't work." : "This PDF is password protected.");
    this.name = "PdfPasswordError";
    this.incorrect = incorrect;
  }
}

export function pdfErrorMessage(error: unknown) {
  if (error instanceof PdfPasswordError) return error.message;
  if (error instanceof Error) {
    if (error.name === "InvalidPDFException") {
      return "This PDF couldn't be opened. It may be damaged.";
    }
    if (error.name === "PasswordException") return "This PDF is password protected.";
    if (/quota/i.test(error.message)) return "This PDF is too large to store in the browser.";
    if (error.message && error.message.length < 140 && !/undefined|object Object/i.test(error.message)) {
      return error.message;
    }
  }
  return "This PDF couldn't be opened.";
}
