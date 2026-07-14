/**
 * Deterministically picks the best of several OCR results for the same
 * document (e.g. the original render vs. a preprocessed render, or different
 * Tesseract settings) — never by raw OCR engine confidence alone, since a
 * confidently-misread page is exactly the failure mode this whole hardening
 * effort exists to catch. Pure comparator over pre-computed metrics; it does
 * not run OCR, quality evaluation, or financial recovery itself.
 */

export interface OcrCandidateEvaluation {
  /** A short, stable identifier for this candidate, e.g. `"original"`, `"preprocessed"`. */
  name: string;
  /** `TextQualityResult.generalScore` for this candidate's text. */
  generalScore: number;
  /** `TextQualityResult.financial.score` — `null` when no financial label was found (finance checks not applicable). */
  financialScore: number | null;
  /** Average OCR engine confidence across this candidate's pages, when available — the last-resort tie-breaker, never the primary signal. */
  confidence: number | null;
  /** Count of this candidate's recovered financial values with `confidence: "high"` and a usable (`direct`/`recovered`) status. */
  recoveredHighConfidenceCount: number;
  /** `FinancialIntegrityMetrics.arithmeticConflictCount` for this candidate. */
  arithmeticConflictCount: number;
  /** `FinancialIntegrityMetrics.zeroAmountSuspicionCount` for this candidate. */
  zeroAmountSuspicionCount: number;
}

export interface OcrCandidateScore {
  name: string;
  generalScore: number;
  financialScore: number | null;
  confidence: number | null;
}

export interface OcrCandidateSelectionResult {
  selectedCandidate: string;
  candidateScores: OcrCandidateScore[];
}

/** The single blended figure a candidate is primarily ranked on — general quality capped by financial integrity, exactly like `evaluateTextQuality`'s own overall score, so "reads fine but the numbers are wrong" cannot win just for being fluent. */
function combinedScore(candidate: OcrCandidateEvaluation): number {
  return candidate.financialScore === null ? candidate.generalScore : Math.min(candidate.generalScore, candidate.financialScore);
}

/**
 * Returns a negative number when `a` should be preferred over `b`, positive
 * when `b` should be preferred, zero only when every tie-break is exhausted
 * (in which case input order decides — this function is never called on an
 * unordered pair without a stable fallback).
 */
function compareCandidates(a: OcrCandidateEvaluation, b: OcrCandidateEvaluation): number {
  const combinedDiff = combinedScore(b) - combinedScore(a);
  if (combinedDiff !== 0) return combinedDiff;

  const confidenceDiff = (b.confidence ?? -1) - (a.confidence ?? -1);
  if (confidenceDiff !== 0) return confidenceDiff;

  const recoveredDiff = b.recoveredHighConfidenceCount - a.recoveredHighConfidenceCount;
  if (recoveredDiff !== 0) return recoveredDiff;

  const arithmeticDiff = a.arithmeticConflictCount - b.arithmeticConflictCount;
  if (arithmeticDiff !== 0) return arithmeticDiff;

  const zeroSuspicionDiff = a.zeroAmountSuspicionCount - b.zeroAmountSuspicionCount;
  if (zeroSuspicionDiff !== 0) return zeroSuspicionDiff;

  return 0;
}

/**
 * Picks the best candidate out of one or more OCR results for the same
 * document. With a single candidate, that candidate is simply selected (no
 * comparison needed) — this function is safe to call unconditionally even
 * when no alternate rendering/preprocessing pass was attempted.
 */
export function selectBestOcrCandidate(candidates: readonly OcrCandidateEvaluation[]): OcrCandidateSelectionResult {
  if (candidates.length === 0) {
    throw new Error("selectBestOcrCandidate requires at least one candidate");
  }

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (compareCandidates(candidates[i], best) < 0) {
      best = candidates[i];
    }
  }

  return {
    selectedCandidate: best.name,
    candidateScores: candidates.map((candidate) => ({
      name: candidate.name,
      generalScore: candidate.generalScore,
      financialScore: candidate.financialScore,
      confidence: candidate.confidence,
    })),
  };
}
