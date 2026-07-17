import { Router, type IRouter, type Request, type Response } from "express";
import {
  analyzePersonalizedFinancialImpact,
  ContractAnalysisError,
  personalizedAnalysisRequestSchema,
  type PersonalizedAnalysisResponse,
} from "@workspace/contract-analysis";

const router: IRouter = Router();

/**
 * Keeps the personalized-analysis request bounded end to end: even with the
 * Gemini per-key attempt timeout (see `GEMINI_ATTEMPT_TIMEOUT_MS` in
 * `geminiProvider.ts`) bounding each individual key, the full initial +
 * correction + OpenRouter-fallback sequence could still, in a pathological
 * worst case, run long — this is the outer safety net so the frontend never
 * waits indefinitely and can reliably show its retry state (see
 * `usePersonalizedAnalysisSession`/`PersonalizedAnalysisSection`). Mirrors
 * `contractChat.service.ts`'s `withTimeout`/`DEFAULT_CONTRACT_CHAT_TIMEOUT_MS`
 * pattern exactly.
 */
export const DEFAULT_PERSONALIZED_ANALYSIS_TIMEOUT_MS = 45_000;

export class PersonalizedAnalysisTimeoutError extends Error {
  constructor() {
    super("Personalized financial analysis timed out.");
    this.name = "PersonalizedAnalysisTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PersonalizedAnalysisTimeoutError()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Injectable so tests can verify the exact request payload passed through
 * and simulate provider failures without a live AI call. Production code
 * never passes this — the real implementation is the default.
 */
export interface AnalyzeFinancialImpactHandlerDeps {
  analyzePersonalizedFinancialImpact: typeof analyzePersonalizedFinancialImpact;
  /** Overridable purely for tests — production always uses `DEFAULT_PERSONALIZED_ANALYSIS_TIMEOUT_MS`. */
  timeoutMs?: number;
}

const defaultDeps: AnalyzeFinancialImpactHandlerDeps = {
  analyzePersonalizedFinancialImpact,
};

/**
 * The request body is the frontend's own already-sanitized, already-computed
 * summary (see `personalizedAnalysisRequestSchema`): contract type, a plain
 * contract summary, sanitized clauses, classified financial concepts, and
 * deterministic budget metrics. No file, no raw contract text, no party
 * identifiers, no national ID/phone/email/IBAN/bank account — the schema
 * itself has no room for any of those, so this route never needs its own
 * PII handling.
 */
export async function handleAnalyzeFinancialImpact(
  req: Request,
  res: Response,
  deps: AnalyzeFinancialImpactHandlerDeps = defaultDeps,
): Promise<void> {
  const parsedRequest = personalizedAnalysisRequestSchema.safeParse(req.body);
  if (!parsedRequest.success) {
    res.status(400).json({
      success: false,
      message: "Request payload is missing or does not match the expected shape.",
    });
    return;
  }

  try {
    const analysis: PersonalizedAnalysisResponse = await withTimeout(
      deps.analyzePersonalizedFinancialImpact(parsedRequest.data),
      deps.timeoutMs ?? DEFAULT_PERSONALIZED_ANALYSIS_TIMEOUT_MS,
    );
    res.json({ success: true, analysis });
  } catch (err) {
    if (err instanceof PersonalizedAnalysisTimeoutError) {
      req.log.warn({ code: "TIMEOUT" }, "Personalized financial analysis timed out");
      res.status(504).json({
        success: false,
        code: "TIMEOUT",
        message: "Personalized financial analysis timed out.",
      });
      return;
    }

    const message =
      err instanceof ContractAnalysisError ? err.message : "Personalized financial analysis failed unexpectedly.";

    req.log.warn(
      {
        code: err instanceof ContractAnalysisError ? err.code : "UNKNOWN",
        message: err instanceof Error ? err.message : String(err),
      },
      "Personalized financial analysis failed",
    );

    res.status(422).json({
      success: false,
      message,
      ...(err instanceof ContractAnalysisError ? { code: err.code } : {}),
    });
  }
}

router.post("/analyze-financial-impact", (req, res) => handleAnalyzeFinancialImpact(req, res));

export default router;
