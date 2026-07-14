import { labelSimilarity } from "../normalize/text";
import type { Candidate } from "./candidates";
import { compareCandidatesByPriority } from "./priority";

function roundedAmountKey(value: number | null): string {
  return value === null ? "null" : value.toFixed(2);
}

/**
 * The same real item can appear from more than one Milestone 4 location,
 * often in a different language (e.g. `typeDetails.monthlyInstallment` and a
 * matching `financialObligations[]` entry titled "القسط الشهري" or "Monthly
 * installment"). Structured properties -- category, frequency, currency,
 * amount -- are what a genuine duplicate agrees on regardless of language or
 * wording; title is deliberately NOT part of this key (see `canMerge`),
 * since two descriptions of the same real-world item are not expected to be
 * textually similar across languages. `mandatory`/`conditional` are also
 * excluded from the hard key (moved to `canMerge`'s compatibility check)
 * because two reports of the same item frequently differ there only because
 * one source's wording happened to state it explicitly and the other
 * didn't -- an information gap, not a genuine disagreement.
 */
function structuralGroupKey(candidate: Candidate): string {
  return [
    candidate.targetKind,
    candidate.specialKey ?? "",
    candidate.obligationType ?? "",
    candidate.feeType ?? "",
    candidate.penaltyType ?? "",
    candidate.frequency ?? "",
    candidate.currency ?? "",
    roundedAmountKey(candidate.amountValue),
  ].join("|");
}

/** `null` on either side is an information gap, not a disagreement -- only two differing *known* values count as a genuine conflict. */
function triStateCompatible<T>(a: T | null, b: T | null): boolean {
  return a === null || b === null || a === b;
}

/**
 * True when a candidate's own classification is too generic to be trusted as
 * a duplicate signal on its own -- an unclassified obligation/fee/penalty
 * needs the extra normalized-title-overlap check in `canMerge` before being
 * merged with another candidate that merely happens to share the same
 * amount/frequency/currency.
 */
function hasGenericCategory(candidate: Candidate): boolean {
  const category = candidate.obligationType ?? candidate.feeType ?? candidate.penaltyType;
  return category === undefined || category === "unknown" || category === "other";
}

/**
 * Two candidates that already share a `structuralGroupKey` are only actually
 * treated as the same real-world item when, additionally:
 * - `mandatory`, `conditional`, and `startDate` (timing/due date) do not
 *   *explicitly contradict* each other -- a stated `true` against a stated
 *   `false`, or two differing explicit dates, is real evidence they may be
 *   separate items and blocks the merge; an unstated (`null`) value on
 *   either side never blocks it.
 * - when NEITHER candidate's category was confidently classified, their
 *   normalized labels share at least one token. This is the conservative
 *   fallback for two same-amount, same-frequency, unclassified items (e.g.
 *   two coincidentally-500-SAR one-time charges of a genuinely different
 *   nature) -- it is never required when at least one side has a specific,
 *   shared classification (e.g. both "upfront_payment"), since a bilingual
 *   pair describing the same classified concept is not expected to share
 *   any token at all.
 */
function canMerge(a: Candidate, b: Candidate): boolean {
  if (!triStateCompatible(a.mandatory, b.mandatory)) return false;
  if (!triStateCompatible(a.conditional, b.conditional)) return false;
  if (!triStateCompatible(a.startDate, b.startDate)) return false;
  if (hasGenericCategory(a) && hasGenericCategory(b) && labelSimilarity(a.label, b.label) <= 0) {
    return false;
  }
  return true;
}

export interface DeduplicationResult {
  candidates: Candidate[];
  duplicatesRemovedCount: number;
}

/**
 * Collapses duplicate candidates (the same real-world item reported from
 * more than one location, possibly in a different language or wording) down
 * to a single representative -- the highest source-priority, best-evidence
 * one -- for each cluster. Never sums duplicate amounts. Conservative by
 * construction: candidates only ever merge within the same structural
 * group, and even then only when `canMerge` finds no explicit disagreement
 * (see above) -- two candidates that might genuinely be separate are always
 * kept apart.
 */
export function deduplicateCandidates(candidates: Candidate[]): DeduplicationResult {
  const groups = new Map<string, Candidate[][]>();
  for (const candidate of candidates) {
    const key = structuralGroupKey(candidate);
    const clusters = groups.get(key);
    if (!clusters) {
      groups.set(key, [[candidate]]);
      continue;
    }
    const matchingCluster = clusters.find((cluster) => canMerge(cluster[0], candidate));
    if (matchingCluster) {
      matchingCluster.push(candidate);
    } else {
      clusters.push([candidate]);
    }
  }

  const deduped: Candidate[] = [];
  let duplicatesRemovedCount = 0;
  for (const clusters of groups.values()) {
    for (const cluster of clusters) {
      const sorted = [...cluster].sort(compareCandidatesByPriority);
      deduped.push(sorted[0]);
      duplicatesRemovedCount += sorted.length - 1;
    }
  }

  return { candidates: deduped, duplicatesRemovedCount };
}
