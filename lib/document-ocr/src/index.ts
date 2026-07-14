export type {
  DocumentExtractionMethod,
  DocumentTextQuality,
  DocumentExtractionMetadata,
  DocumentExtractionResult,
  TextQualityMetrics,
  TextQualityResult,
  RenderedPdfPage,
  OcrPageResult,
  OcrRunOptions,
  OcrProvider,
} from "./types";

export { TEXT_QUALITY_THRESHOLDS, evaluateTextQuality } from "./textQuality";
export { normalizeOcrText } from "./textNormalizer";

export type { OcrRuntimeConfig } from "./config";
export { DEFAULT_OCR_RUNTIME_CONFIG, loadOcrConfigFromEnv } from "./config";

export type { DocumentOcrErrorCode } from "./errors";
export {
  DocumentOcrError,
  ocrDisabledError,
  ocrRenderFailedError,
  ocrRecognitionFailedError,
  ocrTimeoutError,
  ocrPageLimitExceededError,
  documentTextUnreadableError,
} from "./errors";

export type { RenderPdfPagesOptions, RenderPdfPagesResult } from "./pdfPageRenderer";
export { renderPdfPagesToImages } from "./pdfPageRenderer";

export type { TesseractProviderConfig } from "./ocrProvider/tesseractProvider";
export { createTesseractOcrProvider, resolveWorkerPath } from "./ocrProvider/tesseractProvider";

export type { OcrFallbackInput, OcrFallbackDeps, DiagnosticEventListener } from "./runOcrFallbackPipeline";
export { runOcrFallbackPipeline } from "./runOcrFallbackPipeline";

export type { OcrCandidateEvaluation, OcrCandidateScore, OcrCandidateSelectionResult } from "./candidateSelection";
export { selectBestOcrCandidate } from "./candidateSelection";

export type {
  RecoveredFinancialField,
  RecoveredFinancialUnit,
  RecoveredFinancialStatus,
  RecoveredFinancialConfidence,
  RecoveredFinancialSource,
  RecoveredFinancialValue,
  FinancialRecoveryResult,
} from "./financialTextRecovery";
export { recoverFinancialValues } from "./financialTextRecovery";
