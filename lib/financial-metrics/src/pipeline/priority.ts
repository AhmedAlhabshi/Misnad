import type { Confidence } from "../enums";
import type { Candidate, CandidateSourceKind } from "./candidates";

/**
 * Source priority per the spec: contract-specific structured field →
 * explicit financial obligation → explicit fee/penalty item → extracted
 * number. Higher number wins.
 */
const SOURCE_KIND_PRIORITY: Record<CandidateSourceKind, number> = {
  type_details: 5,
  financial_obligation: 4,
  fee_item: 3,
  penalty_item: 3,
  extracted_number: 2,
};

const CONFIDENCE_PRIORITY: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

/**
 * Deterministic ordering for both duplicate-resolution and
 * conflict-resolution: source priority, then confidence, then evidence
 * strength (longer/more specific text), then a stable lexical tiebreaker on
 * the source field path — never random, never an average.
 */
export function compareCandidatesByPriority(a: Candidate, b: Candidate): number {
  const sourceDiff = SOURCE_KIND_PRIORITY[b.sourceKind] - SOURCE_KIND_PRIORITY[a.sourceKind];
  if (sourceDiff !== 0) {
    return sourceDiff;
  }

  const confidenceDiff = CONFIDENCE_PRIORITY[b.confidence] - CONFIDENCE_PRIORITY[a.confidence];
  if (confidenceDiff !== 0) {
    return confidenceDiff;
  }

  const evidenceLengthDiff = (b.evidence?.length ?? 0) - (a.evidence?.length ?? 0);
  if (evidenceLengthDiff !== 0) {
    return evidenceLengthDiff;
  }

  return a.sourceField.localeCompare(b.sourceField);
}
