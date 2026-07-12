import type { Candidate } from "./candidates";
import { compareCandidatesByPriority } from "./priority";

function roundedAmountKey(value: number | null): string {
  return value === null ? "null" : value.toFixed(2);
}

/**
 * The same real item can appear from more than one Milestone 4 location
 * (e.g. `typeDetails.monthlyInstallment` and a matching
 * `financialObligations[]` entry). Grouping on category + frequency +
 * currency + amount + mandatory/conditional (not amount alone) ensures two
 * different items that merely share a number — e.g. a SAR 1,000 monthly
 * installment and a separate SAR 1,000 administration fee — are never
 * collapsed together.
 */
function exactDuplicateKey(candidate: Candidate): string {
  return [
    candidate.targetKind,
    candidate.specialKey ?? "",
    candidate.obligationType ?? "",
    candidate.feeType ?? "",
    candidate.penaltyType ?? "",
    candidate.frequency ?? "",
    candidate.currency ?? "",
    roundedAmountKey(candidate.amountValue),
    candidate.mandatory === null ? "null" : String(candidate.mandatory),
    candidate.conditional === null ? "null" : String(candidate.conditional),
  ].join("|");
}

export interface DeduplicationResult {
  candidates: Candidate[];
  duplicatesRemovedCount: number;
}

/**
 * Collapses exact-duplicate candidates (the same item reported from more
 * than one location) down to a single representative — the highest
 * source-priority, best-evidence one — for each group. Never sums
 * duplicate amounts.
 */
export function deduplicateCandidates(candidates: Candidate[]): DeduplicationResult {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = exactDuplicateKey(candidate);
    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  const deduped: Candidate[] = [];
  let duplicatesRemovedCount = 0;
  for (const group of groups.values()) {
    const sorted = [...group].sort(compareCandidatesByPriority);
    deduped.push(sorted[0]);
    duplicatesRemovedCount += sorted.length - 1;
  }

  return { candidates: deduped, duplicatesRemovedCount };
}
