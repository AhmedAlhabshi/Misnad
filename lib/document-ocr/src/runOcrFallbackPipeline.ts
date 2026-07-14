import { type OcrCandidateEvaluation, selectBestOcrCandidate } from "./candidateSelection";
import type { OcrRuntimeConfig } from "./config";
import { documentTextUnreadableError, ocrDisabledError, ocrPageLimitExceededError, ocrTimeoutError } from "./errors";
import { recoverFinancialValues } from "./financialTextRecovery";
import { preprocessPageImage } from "./imagePreprocessor";
import { normalizeOcrText } from "./textNormalizer";
import { evaluateTextQuality } from "./textQuality";
import type {
  DocumentExtractionMetadata,
  DocumentExtractionResult,
  OcrPageResult,
  OcrProvider,
  RenderedPdfPage,
  TextQualityResult,
} from "./types";
import type { renderPdfPagesToImages as RenderPdfPagesToImagesFn } from "./pdfPageRenderer";

/** Safe, non-content diagnostic metadata only — never the recognized/extracted text itself. */
export type DiagnosticEventListener = (event: string, meta: Record<string, unknown>) => void;

export interface OcrFallbackInput {
  buffer: Buffer;
  nativeText: string;
  nativePageCount: number;
}

export interface OcrFallbackDeps {
  config: OcrRuntimeConfig;
  ocrProvider: OcrProvider;
  renderPdfPagesToImages: typeof RenderPdfPagesToImagesFn;
  onEvent?: DiagnosticEventListener;
}

function buildMergedOcrText(pageResults: readonly OcrPageResult[]): string {
  return pageResults
    .filter((result) => !result.warning)
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((result) => `--- PAGE ${result.pageNumber} ---\n${result.text}`)
    .join("\n\n");
}

/** One full recognize+merge+evaluate pass over a specific set of page images — "original" always runs; "preprocessed" only when `OCR_PREPROCESSING_ENABLED` is on, so it can be compared against the original rather than blindly trusted. */
interface OcrTextCandidate {
  name: string;
  pageResults: OcrPageResult[];
  mergedText: string;
  quality: TextQualityResult;
}

async function runOcrCandidate(
  name: string,
  pages: readonly RenderedPdfPage[],
  ocrProvider: OcrProvider,
  config: OcrRuntimeConfig,
  nativePageCount: number,
  signal: AbortSignal,
): Promise<OcrTextCandidate> {
  const pageResults = await ocrProvider.recognizePages(pages, {
    languages: config.languages,
    pageTimeoutMs: config.pageTimeoutMs,
    pageConcurrency: config.pageConcurrency,
    dpi: Math.round(config.renderScale * 72),
    signal,
  });
  const mergedText = normalizeOcrText(buildMergedOcrText(pageResults));
  const quality = evaluateTextQuality(mergedText, nativePageCount);
  return { name, pageResults, mergedText, quality };
}

/** Only the subset of `DocumentExtractionMetadata` that financial recovery/integrity populates — omitted entirely (not just `undefined`-valued) when no tracked financial label was found at all, so a non-financial document's metadata stays exactly as before this feature existed. */
function buildFinancialMetadataFields(
  quality: TextQualityResult,
  recoveredValues: ReturnType<typeof recoverFinancialValues>["values"],
  recoveryWarnings: readonly string[],
): Pick<DocumentExtractionMetadata, "financialQuality" | "financialQualityScore" | "recoveredFinancialValues" | "financialRecoveryWarnings"> {
  if (!quality.financial.applicable) return {};
  const resolvedCount = recoveredValues.filter((value) => value.status === "direct" || value.status === "recovered").length;
  return {
    financialQuality: quality.financial.quality ?? undefined,
    financialQualityScore: quality.financial.score ?? undefined,
    recoveredFinancialValues: resolvedCount,
    financialRecoveryWarnings: recoveryWarnings.length > 0 ? [...recoveryWarnings] : undefined,
  };
}

/**
 * Decides whether OCR is needed for a document whose native text has
 * already been extracted, and if so runs the full render → recognize →
 * merge → normalize → re-evaluate pipeline, choosing whichever of the
 * native text or the OCR result is actually better rather than assuming
 * OCR always wins. Never returns a "poor"-quality result when a better one
 * was available — and never returns any text at all when neither source is
 * usable (`DOCUMENT_TEXT_UNREADABLE`).
 */
export async function runOcrFallbackPipeline(
  input: OcrFallbackInput,
  deps: OcrFallbackDeps,
): Promise<DocumentExtractionResult> {
  const startedAt = Date.now();
  const { buffer, nativeText, nativePageCount } = input;
  const { config, ocrProvider, renderPdfPagesToImages, onEvent } = deps;

  const nativeQuality = evaluateTextQuality(nativeText, nativePageCount);
  onEvent?.("document_text_quality_evaluated", {
    quality: nativeQuality.quality,
    score: nativeQuality.score,
    pageCount: nativePageCount,
  });

  if (!nativeQuality.shouldUseOcr) {
    const nativeRecovery = recoverFinancialValues(nativeText);
    return {
      method: "native",
      text: nativeText,
      pageCount: nativePageCount,
      quality: nativeQuality.quality,
      warnings: nativeQuality.warnings,
      recoveredFinancialValues: nativeRecovery.values,
      metadata: {
        ocrUsed: false,
        processedPages: nativePageCount,
        skippedPages: 0,
        durationMs: Date.now() - startedAt,
        nativeQualityScore: nativeQuality.score,
        ...buildFinancialMetadataFields(nativeQuality, nativeRecovery.values, nativeRecovery.warnings),
      },
    };
  }

  if (!config.enabled) {
    throw ocrDisabledError();
  }
  if (nativePageCount > config.maxPages) {
    throw ocrPageLimitExceededError(nativePageCount, config.maxPages);
  }

  onEvent?.("document_ocr_fallback_started", { pageCount: nativePageCount, languages: config.languages });

  const overallController = new AbortController();
  const overallTimer = setTimeout(() => overallController.abort(), config.timeoutMs);

  // Warnings raised while attempting OCR (render/page failures) — kept
  // separate from `nativeQuality.warnings` so a resolved native-extraction
  // diagnostic (e.g. "[TEXT_TOO_SHORT]") never lingers in the final result
  // once OCR successfully replaces that text.
  const attemptWarnings: string[] = [];
  let ocrPageResults: OcrPageResult[];
  let mergedOcrText: string;
  let ocrQuality: TextQualityResult;
  let selectedCandidateName: string | undefined;

  try {
    const pageNumbers = Array.from({ length: nativePageCount }, (_, index) => index + 1);
    const renderResult = await renderPdfPagesToImages(buffer, pageNumbers, { scale: config.renderScale });

    for (const failedPage of renderResult.failedPageNumbers) {
      attemptWarnings.push(`[PAGE_RENDER_FAILED] page ${failedPage} could not be rendered`);
      onEvent?.("document_page_rendered", { pageNumber: failedPage, success: false });
    }
    for (const page of renderResult.pages) {
      onEvent?.("document_page_rendered", { pageNumber: page.pageNumber, success: true });
    }

    if (overallController.signal.aborted) {
      onEvent?.("document_ocr_timeout", { pageCount: nativePageCount, stage: "render" });
      throw ocrTimeoutError();
    }

    const candidates: OcrTextCandidate[] = [
      await runOcrCandidate("original", renderResult.pages, ocrProvider, config, nativePageCount, overallController.signal),
    ];

    if (config.preprocessingEnabled && renderResult.pages.length > 0 && !overallController.signal.aborted) {
      // Sequential, like rendering itself — bounds memory to one page's
      // pixel buffer at a time. A page that fails to preprocess (e.g. an
      // unexpected image format) keeps its original rendered image rather
      // than losing the page entirely; preprocessing is only ever an
      // optional enhancement, never the sole path.
      const preprocessedPages: RenderedPdfPage[] = [];
      for (const page of renderResult.pages) {
        try {
          preprocessedPages.push({ ...page, png: await preprocessPageImage(page.png) });
        } catch {
          preprocessedPages.push(page);
        }
      }
      candidates.push(
        await runOcrCandidate("preprocessed", preprocessedPages, ocrProvider, config, nativePageCount, overallController.signal),
      );
    }

    let selected: OcrTextCandidate;
    if (candidates.length === 1) {
      selected = candidates[0];
    } else {
      // Never select by raw OCR confidence alone — combine general text
      // quality, financial integrity, and recovery signal counts.
      const evaluations: OcrCandidateEvaluation[] = candidates.map((candidate) => {
        const confidences = candidate.pageResults
          .map((result) => result.confidence)
          .filter((value): value is number => value !== undefined);
        const averageConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
        const recovery = recoverFinancialValues(candidate.mergedText);
        const recoveredHighConfidenceCount = recovery.values.filter(
          (value) => value.confidence === "high" && (value.status === "direct" || value.status === "recovered"),
        ).length;
        return {
          name: candidate.name,
          generalScore: candidate.quality.generalScore,
          financialScore: candidate.quality.financial.score,
          confidence: averageConfidence,
          recoveredHighConfidenceCount,
          arithmeticConflictCount: candidate.quality.financial.metrics?.arithmeticConflictCount ?? 0,
          zeroAmountSuspicionCount: candidate.quality.financial.metrics?.zeroAmountSuspicionCount ?? 0,
        };
      });
      const selection = selectBestOcrCandidate(evaluations);
      selectedCandidateName = selection.selectedCandidate;
      selected = candidates.find((candidate) => candidate.name === selection.selectedCandidate)!;
      onEvent?.("document_ocr_candidate_selected", {
        selectedCandidate: selection.selectedCandidate,
        candidateScores: selection.candidateScores,
      });
    }

    ocrPageResults = selected.pageResults;
    mergedOcrText = selected.mergedText;
    ocrQuality = selected.quality;

    for (const pageResult of ocrPageResults) {
      if (pageResult.warning) {
        attemptWarnings.push(`[OCR_PAGE_FAILED] ${pageResult.warning}`);
        onEvent?.("document_ocr_page_failed", { pageNumber: pageResult.pageNumber });
      } else {
        onEvent?.("document_ocr_page_completed", {
          pageNumber: pageResult.pageNumber,
          durationMs: pageResult.durationMs,
          confidence: pageResult.confidence,
        });
      }
    }

    if (overallController.signal.aborted && ocrPageResults.every((result) => result.warning)) {
      onEvent?.("document_ocr_timeout", { pageCount: nativePageCount, stage: "recognize" });
      throw ocrTimeoutError();
    }
  } finally {
    clearTimeout(overallTimer);
  }

  const skippedPages = ocrPageResults.filter((result) => result.warning).length;
  const processedPages = nativePageCount - skippedPages;

  onEvent?.("document_ocr_completed", {
    pageCount: nativePageCount,
    processedPages,
    skippedPages,
    quality: ocrQuality.quality,
    score: ocrQuality.score,
  });

  if (nativeQuality.quality === "poor" && ocrQuality.quality === "poor") {
    throw documentTextUnreadableError();
  }

  // Never assume OCR is automatically better — pick whichever source scores
  // higher, and say so when OCR was attempted but did not win.
  const useOcr = ocrQuality.score >= nativeQuality.score;

  const finalText = useOcr ? mergedOcrText : nativeText;
  const finalQuality = useOcr ? ocrQuality : nativeQuality;
  const finalRecovery = recoverFinancialValues(finalText);

  // Native-extraction warnings only describe the text actually being
  // returned when native wins; once OCR replaces the text, its own warnings
  // (not the now-resolved native ones) are what matter.
  const finalWarnings = useOcr
    ? [...attemptWarnings, ...ocrQuality.warnings]
    : [
        ...nativeQuality.warnings,
        ...attemptWarnings,
        "[OCR_LOW_QUALITY] the OCR result was not better than the original extracted text; using the original text",
      ];

  return {
    method: useOcr ? "ocr" : "native",
    text: finalText,
    pageCount: nativePageCount,
    quality: finalQuality.quality,
    warnings: finalWarnings,
    recoveredFinancialValues: finalRecovery.values,
    metadata: {
      ocrUsed: useOcr,
      processedPages: useOcr ? processedPages : nativePageCount,
      skippedPages: useOcr ? skippedPages : 0,
      durationMs: Date.now() - startedAt,
      languages: config.languages.split("+"),
      nativeQualityScore: nativeQuality.score,
      ocrQualityScore: ocrQuality.score,
      selectedOcrCandidate: selectedCandidateName,
      ...buildFinancialMetadataFields(finalQuality, finalRecovery.values, finalRecovery.warnings),
    },
  };
}
