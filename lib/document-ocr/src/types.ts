import type { RecoveredFinancialValue } from "./financialTextRecovery";

/**
 * How the final text of a document was obtained. `"native"` means the PDF's
 * own text layer was usable as-is; `"ocr"` means the text layer was missing
 * or too poor to trust, so rendered page images were recognized instead.
 */
export type DocumentExtractionMethod = "native" | "ocr";

/** Coarse quality bucket a text quality evaluation resolves to — see `textQuality.ts`. */
export type DocumentTextQuality = "good" | "partial" | "poor";

/** Safe-to-log, non-content metadata about how a document's text was produced. */
export interface DocumentExtractionMetadata {
  ocrUsed: boolean;
  processedPages: number;
  skippedPages: number;
  durationMs: number;
  languages?: string[];
  nativeQualityScore?: number;
  ocrQualityScore?: number;
  /** Present only when at least one financial label was found — see `evaluateFinancialIntegrity`. */
  financialQuality?: DocumentTextQuality;
  financialQualityScore?: number;
  /** Count of the 8 tracked financial fields resolved via `direct` or `recovered` status — never a content payload. */
  recoveredFinancialValues?: number;
  financialRecoveryWarnings?: string[];
  /** Which OCR rendering/preprocessing candidate was selected, when more than one was tried — see `runOcrFallbackPipeline.ts`. */
  selectedOcrCandidate?: string;
}

/** The unified result the document parser returns, regardless of which path (native or OCR) produced it. */
export interface DocumentExtractionResult {
  method: DocumentExtractionMethod;
  text: string;
  pageCount: number;
  quality: DocumentTextQuality;
  warnings: string[];
  metadata: DocumentExtractionMetadata;
  /**
   * The full deterministic financial-value recovery, when applicable —
   * internal-use only (e.g. to build Contract Understanding recovery-notes
   * text); the public API response only ever exposes a count/warning
   * summary of this via `metadata`, never this array itself.
   */
  recoveredFinancialValues?: RecoveredFinancialValue[];
}

/** Per-page quality/quantity metrics used to decide whether OCR is needed — see `textQuality.ts`. */
export interface TextQualityMetrics {
  totalCharacters: number;
  charactersPerPage: number;
  readableCharacterRatio: number;
  suspiciousSymbolRatio: number;
  mojibakeRatio: number;
  replacementCharacterCount: number;
}

/** Financial-number-integrity signals — only meaningful when the text actually contains financial contract labels; see `evaluateFinancialIntegrity`. */
export interface FinancialIntegrityMetrics {
  financialLabelCount: number;
  financialLabelWithNearbyNumericValueCount: number;
  financialLabelCoverageRatio: number;
  zeroAmountSuspicionCount: number;
  brokenAmountPatternCount: number;
  percentageContextMismatchCount: number;
  durationConflictCount: number;
  arithmeticConflictCount: number;
  recoverableAmountWordCount: number;
  tableNumericDensity: number;
}

export interface FinancialIntegrityResult {
  /** `false` when no tracked financial label was found at all — finance-specific checks never penalize a non-financial contract. */
  applicable: boolean;
  quality: DocumentTextQuality | null;
  score: number | null;
  metrics: FinancialIntegrityMetrics | null;
  warnings: string[];
}

export interface TextQualityResult {
  /** Overall quality — general quality alone when financial checks are not applicable, otherwise capped by financial integrity too (see `evaluateTextQuality`). */
  quality: DocumentTextQuality;
  score: number;
  shouldUseOcr: boolean;
  warnings: string[];
  metrics: TextQualityMetrics;
  generalQuality: DocumentTextQuality;
  generalScore: number;
  financial: FinancialIntegrityResult;
}

/** One rendered PDF page, ready to be handed to an `OcrProvider` — always an in-memory PNG buffer, never written to disk. */
export interface RenderedPdfPage {
  pageNumber: number;
  png: Buffer;
  width: number;
  height: number;
}

/** Per-page OCR recognition result — kept separate before merging so page numbers survive for future evidence highlighting. */
export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence?: number;
  durationMs: number;
  /** Set when this specific page failed or was skipped — never contains recognized text. */
  warning?: string;
}

export interface OcrRunOptions {
  /** Tesseract-style language spec, e.g. `"ara+eng"`. */
  languages: string;
  /** Per-page recognition timeout; a page exceeding this is treated as failed, not fatal to the whole run. */
  pageTimeoutMs: number;
  /** How many pages may be recognized concurrently — kept low by default to bound memory/CPU use. */
  pageConcurrency: number;
  /** The actual DPI the page images were rendered at (derived from `OcrRuntimeConfig.renderScale`) — passed to Tesseract's `user_defined_dpi` so it doesn't have to guess, since a rendered PNG carries no DPI metadata of its own. */
  dpi?: number;
  /** Aborted when the overall OCR timeout elapses; providers must stop and clean up promptly. */
  signal?: AbortSignal;
}

/**
 * Abstraction over "recognize these page images" so the rest of the system
 * never depends on Tesseract directly — a future cloud OCR provider only
 * needs to implement this one method. Takes every page for a document in a
 * single call (rather than one call per page) so an implementation can
 * manage expensive resources (e.g. a Tesseract worker) with one lifecycle
 * per document instead of one per page.
 */
export interface OcrProvider {
  recognizePages(pages: readonly RenderedPdfPage[], options: OcrRunOptions): Promise<OcrPageResult[]>;
}
