import { Router, type IRouter, type Request, type Response } from "express";
import {
  analyzePersonalizedFinancialImpact,
  ContractAnalysisError,
  personalizedAnalysisRequestSchema,
  type PersonalizedAnalysisResponse,
} from "@workspace/contract-analysis";

const router: IRouter = Router();

/**
 * Injectable so tests can verify the exact request payload passed through
 * and simulate provider failures without a live AI call. Production code
 * never passes this — the real implementation is the default.
 */
export interface AnalyzeFinancialImpactHandlerDeps {
  analyzePersonalizedFinancialImpact: typeof analyzePersonalizedFinancialImpact;
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
    const analysis: PersonalizedAnalysisResponse = await deps.analyzePersonalizedFinancialImpact(parsedRequest.data);
    res.json({ success: true, analysis });
  } catch (err) {
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
