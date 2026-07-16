import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { extractDocumentText } from "../services/documentParser";
import { indexContractRagSession } from "../services/contractRagIndexer";
import { maskPii } from "../services/piiMasker";
import { analyzeContract, ContractAnalysisError } from "@workspace/contract-analysis";
import { DocumentOcrError, type DocumentExtractionResult } from "@workspace/document-ocr";
import type { ContractUnderstanding } from "@workspace/contract-schema";
import { isAnalysisLanguage, isContractType } from "@workspace/contract-types";
import {
  calculateFinancialMetrics,
  FinancialMetricsEngineError,
  FINANCIAL_METRICS_SCHEMA_VERSION,
  type FinancialMetrics,
} from "@workspace/financial-metrics";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are accepted"));
    }
  },
});

/** True when every character is within the Latin-1 code range (U+0000–U+00FF) — the only range Busboy's mis-decode can ever produce. */
function isWithinLatin1Range(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0xff) {
      return false;
    }
  }
  return true;
}

/**
 * Busboy (multer's multipart parser) decodes the `Content-Disposition:
 * filename="..."` header as Latin-1 by default, even though browsers
 * actually send the raw UTF-8 bytes for non-ASCII file names — producing
 * mojibake for any Arabic (or other non-ASCII) file name. Re-interpreting
 * those Latin-1 code units as UTF-8 bytes recovers the original text.
 *
 * This only ever attempts the re-decode when the name is entirely within
 * the Latin-1 range, since that is the sole range Busboy's mis-decode can
 * produce — a name already containing real Unicode characters (e.g.
 * correctly-decoded Arabic) is left untouched. As a second safety net, the
 * re-decode is discarded (falling back to the original name) whenever it
 * would introduce replacement characters that weren't already present —
 * e.g. a genuinely Western-European Latin-1 name like "café.pdf" is not
 * valid UTF-8 once re-interpreted, so it is correctly left unchanged.
 */
export function decodeUploadedFileName(rawName: string): string {
  if (!isWithinLatin1Range(rawName)) {
    return rawName;
  }
  const reDecoded = Buffer.from(rawName, "latin1").toString("utf8");
  const introducedReplacementChars = reDecoded.includes("�") && !rawName.includes("�");
  return introducedReplacementChars ? rawName : reDecoded;
}

/** Public, user-safe error shape for a Financial Metrics calculation failure — deliberately not part of the `@workspace/financial-metrics` schema, since this is an API-response-layer concern, not a financial-data concern. */
export interface FinancialMetricsPublicError {
  code: "FINANCIAL_METRICS_FAILED";
  message: string;
}

/**
 * Injectable so tests can verify the exact arguments passed to each
 * dependency (in particular, that `analyzeContract` receives the masked
 * text, the user-selected contract type, and the selected language
 * unchanged, and that `calculateFinancialMetrics` receives exactly the
 * validated analysis object) without a live PDF/AI call. Production code
 * never passes this — the real implementations are the default.
 */
export interface AnalyzeContractHandlerDeps {
  extractDocumentText: typeof extractDocumentText;
  maskPii: typeof maskPii;
  analyzeContract: typeof analyzeContract;
  calculateFinancialMetrics: typeof calculateFinancialMetrics;
  indexContractRagSession: typeof indexContractRagSession;
}

const defaultDeps: AnalyzeContractHandlerDeps = {
  extractDocumentText,
  maskPii,
  analyzeContract,
  calculateFinancialMetrics,
  indexContractRagSession,
};

/**
 * Public, response-layer summary of how a document's text was obtained —
 * safe to send to the frontend as-is (no raw content, only
 * method/quality/counters). The financial-integrity fields are only ever
 * present when a tracked financial label was actually found (see
 * `buildFinancialMetadataFields` in `runOcrFallbackPipeline.ts`) — omitted
 * entirely, not just `undefined`, for a non-financial document, so this
 * response shape is unchanged for the vast majority of existing callers.
 */
function toDocumentExtractionSummary(extraction: DocumentExtractionResult) {
  return {
    method: extraction.method,
    pageCount: extraction.pageCount,
    quality: extraction.quality,
    warnings: extraction.warnings,
    ocrUsed: extraction.metadata.ocrUsed,
    durationMs: extraction.metadata.durationMs,
    processedPages: extraction.metadata.processedPages,
    skippedPages: extraction.metadata.skippedPages,
    ...(extraction.metadata.languages ? { languages: extraction.metadata.languages } : {}),
    ...(extraction.metadata.financialQuality !== undefined ? { financialQuality: extraction.metadata.financialQuality } : {}),
    ...(extraction.metadata.financialQualityScore !== undefined
      ? { financialQualityScore: extraction.metadata.financialQualityScore }
      : {}),
    ...(extraction.metadata.recoveredFinancialValues !== undefined
      ? { recoveredFinancialValues: extraction.metadata.recoveredFinancialValues }
      : {}),
    ...(extraction.metadata.financialRecoveryWarnings ? { financialRecoveryWarnings: extraction.metadata.financialRecoveryWarnings } : {}),
    ...(extraction.metadata.selectedOcrCandidate !== undefined
      ? { selectedOcrCandidate: extraction.metadata.selectedOcrCandidate }
      : {}),
  };
}

export async function handleAnalyzeContract(
  req: Request,
  res: Response,
  deps: AnalyzeContractHandlerDeps = defaultDeps,
): Promise<void> {
  if (!req.file) {
    res.status(400).json({ success: false, message: "No file uploaded" });
    return;
  }

  const userSelectedContractType = req.body.userSelectedContractType;
  if (!isContractType(userSelectedContractType)) {
    res.status(400).json({
      success: false,
      message: "userSelectedContractType is missing or invalid",
    });
    return;
  }

  const analysisLanguage = req.body.analysisLanguage;
  if (!isAnalysisLanguage(analysisLanguage)) {
    res.status(400).json({
      success: false,
      message: "analysisLanguage is missing or invalid",
    });
    return;
  }

  try {
    // Stage 1: Extract text from the PDF — this one call is the sole
    // decision-maker for native-text-layer versus OCR; the route never
    // inspects text length or quality itself.
    const extraction = await deps.extractDocumentText(req.file.buffer, {
      onEvent: (event, meta) => req.log.info({ event, ...meta }, event),
    });

    // Stage 2: Mask PII before any future AI processing
    const masked = deps.maskPii(extraction.text);

    // Stage 2.5: Contract RAG indexing (additive feature — failure here must
    // never fail the upload/extraction/masking flow). Uses ONLY the
    // already-masked text; never the raw extracted text. Runs independently
    // of AI analysis success, since the retrieval session doesn't depend on
    // the analysis output — only on the masked text itself.
    let contractRagSessionId: string | null = null;
    let contractRagError: string | null = null;

    try {
      const indexResult = await deps.indexContractRagSession(
        { maskedText: masked.maskedText },
        userSelectedContractType,
        analysisLanguage,
      );
      contractRagSessionId = indexResult.sessionId;
    } catch (err) {
      contractRagError = "CONTRACT_RAG_UNAVAILABLE";
      req.log.warn(
        { message: err instanceof Error ? err.message : String(err) },
        "Contract RAG indexing failed",
      );
    }

    // Stage 3: AI contract understanding (additive feature — failure here must
    // never fail the upload/extraction/masking flow above). Uses only the
    // user-selected contract type; there is no independent AI detection.
    let analysis: ContractUnderstanding | null = null;
    let analysisError: string | null = null;

    try {
      analysis = await deps.analyzeContract(
        masked.maskedText,
        userSelectedContractType,
        analysisLanguage,
        { recoveryNotes: extraction.recoveredFinancialValues },
      );
    } catch (err) {
      analysisError =
        err instanceof ContractAnalysisError
          ? err.message
          : "Contract analysis failed unexpectedly.";
      req.log.warn(
        {
          code: err instanceof ContractAnalysisError ? err.code : "UNKNOWN",
          message: err instanceof Error ? err.message : String(err),
        },
        "Contract analysis failed",
      );
    }

    // Stage 4: deterministic financial metrics calculation from the validated
    // Milestone 4 analysis only — never run when analysis failed, and never
    // given the raw/masked text, AI output, or PDF data. A failure here must
    // not discard a valid analysis (partial success).
    let financialMetrics: FinancialMetrics | null = null;
    let financialMetricsError: FinancialMetricsPublicError | null = null;

    if (analysis) {
      try {
        financialMetrics = deps.calculateFinancialMetrics(analysis);
      } catch (err) {
        financialMetricsError = {
          code: "FINANCIAL_METRICS_FAILED",
          message: "Financial metrics could not be calculated.",
        };
        req.log.error(
          {
            errorName: err instanceof Error ? err.name : typeof err,
            code: err instanceof FinancialMetricsEngineError ? err.code : "UNKNOWN",
            message: err instanceof Error ? err.message : String(err),
            contractType: userSelectedContractType,
            schemaVersion: FINANCIAL_METRICS_SCHEMA_VERSION,
          },
          "Financial metrics calculation failed",
        );
      }
    }

    const isProduction = process.env.NODE_ENV === "production";

    res.json({
      success: true,
      fileName: decodeUploadedFileName(req.file.originalname),
      message: "PDF processed and PII masked successfully",
      textLength: extraction.text.length,
      piiStatistics: masked.statistics,
      documentExtraction: toDocumentExtractionSummary(extraction),
      analysis,
      financialMetrics,
      financialMetricsError,
      contractRagSessionId,
      contractRagError,
      ...(analysisError ? { analysisError } : {}),
      // Raw/masked text previews (native or OCR-derived) are a
      // development-only aid — the frontend never reads these fields, and
      // they must never reach production, since this is unmasked customer
      // contract content either way.
      ...(isProduction
        ? {}
        : {
            textPreview: extraction.text.slice(0, 1000),
            maskedTextPreview: masked.maskedText.slice(0, 1000),
            _dev_rawText: extraction.text,
            _dev_maskedText: masked.maskedText,
            _dev_recoveredFinancialValues: extraction.recoveredFinancialValues,
          }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    res.status(422).json({
      success: false,
      message,
      ...(err instanceof DocumentOcrError ? { code: err.code } : {}),
    });
  }
}

router.post("/analyze-contract", upload.single("file"), (req, res) => handleAnalyzeContract(req, res));

export default router;
