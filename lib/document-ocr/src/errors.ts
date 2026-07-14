/**
 * Mirrors the error-code + factory-function convention already used by
 * `lib/contract-analysis` and `lib/financial-metrics` (`XxxError` class with
 * a `code` field, plus one factory function per code) so callers can branch
 * on `error.code` without parsing message text.
 */
export type DocumentOcrErrorCode =
  | "OCR_DISABLED"
  | "OCR_RENDER_FAILED"
  | "OCR_RECOGNITION_FAILED"
  | "OCR_TIMEOUT"
  | "OCR_PAGE_LIMIT_EXCEEDED"
  | "DOCUMENT_TEXT_UNREADABLE";

export class DocumentOcrError extends Error {
  public readonly code: DocumentOcrErrorCode;

  constructor(code: DocumentOcrErrorCode, message: string) {
    super(message);
    this.name = "DocumentOcrError";
    this.code = code;
  }
}

/** Native text was unusable and OCR would be required, but `OCR_ENABLED=false`. */
export function ocrDisabledError(): DocumentOcrError {
  return new DocumentOcrError(
    "OCR_DISABLED",
    "This document requires OCR to read (its text layer is missing or unusable), but OCR is disabled on this server.",
  );
}

/** Rendering PDF pages to images failed outright (not a per-page failure). */
export function ocrRenderFailedError(reason: string): DocumentOcrError {
  return new DocumentOcrError("OCR_RENDER_FAILED", `Failed to render PDF pages for OCR: ${reason}`);
}

/** OCR recognition failed for the whole document (e.g. every page failed). */
export function ocrRecognitionFailedError(reason: string): DocumentOcrError {
  return new DocumentOcrError("OCR_RECOGNITION_FAILED", `OCR recognition failed: ${reason}`);
}

/** The overall OCR budget (`OCR_TIMEOUT_MS`) elapsed before recognition finished. */
export function ocrTimeoutError(): DocumentOcrError {
  return new DocumentOcrError("OCR_TIMEOUT", "OCR did not finish within the configured time limit.");
}

/** The document has more pages than `OCR_MAX_PAGES` allows. */
export function ocrPageLimitExceededError(pageCount: number, maxPages: number): DocumentOcrError {
  return new DocumentOcrError(
    "OCR_PAGE_LIMIT_EXCEEDED",
    `This document has ${pageCount} pages, which exceeds the OCR page limit of ${maxPages}.`,
  );
}

/** Neither the native text nor the OCR result was usable — never forward garbage text downstream. */
export function documentTextUnreadableError(): DocumentOcrError {
  return new DocumentOcrError(
    "DOCUMENT_TEXT_UNREADABLE",
    "This document's text could not be reliably read, either directly or via OCR.",
  );
}
