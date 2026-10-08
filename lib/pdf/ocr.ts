/**
 * OCR is intentionally isolated. A future provider can recognize a page image
 * and return text without changing extraction or playback.
 */
export interface OcrProvider {
  id: string;
  recognizePage(image: Blob, pageNumber: number): Promise<string>;
}

export function getOcrProvider(): OcrProvider | null {
  return null;
}
