import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { parseContractPdf } from "../services/documentParser";
import { maskPii } from "../services/piiMasker";
import { analyzeContract, ContractAnalysisError } from "@workspace/contract-analysis";
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
  parseContractPdf: typeof parseContractPdf;
  maskPii: typeof maskPii;
  analyzeContract: typeof analyzeContract;
  calculateFinancialMetrics: typeof calculateFinancialMetrics;
}

const defaultDeps: AnalyzeContractHandlerDeps = {
  parseContractPdf,
  maskPii,
  analyzeContract,
  calculateFinancialMetrics,
};

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
    // Stage 1: Extract text from PDF
    const parsed = await deps.parseContractPdf(req.file.buffer);

    // Stage 2: Mask PII before any future AI processing
    const masked = deps.maskPii(parsed.text);

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

    // DEV NOTE: dual output (rawText + maskedText) is temporary — remove before production
    res.json({
      success: true,
      fileName: req.file.originalname,
      message: "PDF processed and PII masked successfully",
      textLength: parsed.textLength,
      textPreview: parsed.textPreview,
      maskedTextPreview: masked.maskedText.slice(0, 1000),
      piiStatistics: masked.statistics,
      analysis,
      financialMetrics,
      financialMetricsError,
      ...(analysisError ? { analysisError } : {}),
      // TODO: remove rawText from response before production
      _dev_rawText: parsed.text,
      _dev_maskedText: masked.maskedText,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    res.status(422).json({ success: false, message });
  }
}

router.post("/analyze-contract", upload.single("file"), (req, res) => handleAnalyzeContract(req, res));

export default router;
