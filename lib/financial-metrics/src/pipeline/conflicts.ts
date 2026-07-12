import type { CalculationConflict } from "../calculationMetadata";
import { normalizeLabel } from "../normalize/text";
import type { Candidate } from "./candidates";
import { compareCandidatesByPriority } from "./priority";

/**
 * Groups candidates that represent the *same metric slot*: special values
 * (principal, credit limit, ...) are singular by construction, so they
 * group by key alone; ordinary obligation/fee/penalty candidates only
 * group together when category, currency, frequency, and the exact
 * (normalized) label all match — this is what stops two genuinely
 * different fees that merely share a category from ever being treated as
 * conflicting reports of the same fee.
 */
function conflictGroupKey(candidate: Candidate): string {
  if (candidate.targetKind === "special") {
    return `special|${candidate.specialKey}`;
  }
  return [
    candidate.targetKind,
    candidate.obligationType ?? "",
    candidate.feeType ?? "",
    candidate.penaltyType ?? "",
    candidate.currency ?? "",
    candidate.frequency ?? "",
    normalizeLabel(candidate.label),
  ].join("|");
}

function metricNameFor(candidate: Candidate): string {
  if (candidate.targetKind === "special") {
    return candidate.specialKey ?? "unknown";
  }
  const category = candidate.obligationType ?? candidate.feeType ?? candidate.penaltyType ?? "unknown";
  return `${candidate.targetKind}:${category}:${normalizeLabel(candidate.label)}`;
}

export interface ConflictResolutionResult {
  candidates: Candidate[];
  conflicts: CalculationConflict[];
}

/**
 * Detects genuine conflicts — multiple credible candidates for the same
 * metric slot with different values — and resolves each deterministically
 * by source/confidence/evidence priority (see `compareCandidatesByPriority`).
 * Never averages, sums, or randomly picks a value; every rejected
 * alternative's value is preserved in the returned `CalculationConflict`.
 */
export function resolveConflicts(candidates: Candidate[]): ConflictResolutionResult {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = conflictGroupKey(candidate);
    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  const resolved: Candidate[] = [];
  const conflicts: CalculationConflict[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      resolved.push(group[0]);
      continue;
    }

    const distinctAmounts = new Set(group.map((candidate) => candidate.amountValue));
    const sorted = [...group].sort(compareCandidatesByPriority);
    const winner = sorted[0];
    resolved.push(winner);

    if (distinctAmounts.size > 1) {
      conflicts.push({
        metric: metricNameFor(winner),
        values: group.map((candidate) => candidate.amountValue),
        resolution: `selected the value from the highest-priority source (${winner.sourceKind}: ${winner.sourceField}); rejected ${group.length - 1} alternative(s) per deterministic source/confidence priority`,
        sourceFields: group.map((candidate) => candidate.sourceField),
      });
    }
  }

  return { candidates: resolved, conflicts };
}

function countCurrencies(candidates: readonly Candidate[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate.currency) {
      counts.set(candidate.currency, (counts.get(candidate.currency) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Determines the contract's single currency. This is NOT a majority vote:
 * backfill/root-currency resolution is only ever safe when exactly one
 * unique recognized currency exists across the *entire* validated contract
 * input. Ten candidates in SAR and one in USD is still two currencies, and
 * must resolve to `null` — never a fabricated or "most common" default.
 */
export function resolveContractCurrency(candidates: readonly Candidate[]): string | null {
  const counts = countCurrencies(candidates);
  return counts.size === 1 ? [...counts.keys()][0] : null;
}

/**
 * Purely informational, non-authoritative description of the currencies
 * observed (e.g. "SAR: 10, USD: 1") for use in a warning's free-text
 * `details` only. This must never be used to backfill a currency or affect
 * any calculation — see `resolveContractCurrency`, which alone decides
 * that, and only when there is exactly one unique currency.
 */
export function describeCurrencyDistribution(candidates: readonly Candidate[]): string | null {
  const counts = countCurrencies(candidates);
  if (counts.size <= 1) {
    return null;
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([currency, count]) => `${currency}: ${count}`)
    .join(", ");
}

/**
 * Backfills the contract's currency onto candidates that have a known
 * amount but no currency of their own (typically `typeDetails` fields,
 * which carry no per-field currency) — only when `contractCurrency` is the
 * single, unique currency resolved by `resolveContractCurrency` (never a
 * majority/plurality). This is inferring the currency already stated
 * elsewhere in the *same* document, never assuming a default currency:
 * candidates whose currency is still unresolved afterward are handled
 * downstream by marking the corresponding metric unavailable rather than
 * fabricating a currency.
 */
export function backfillCandidateCurrencies(
  candidates: Candidate[],
  contractCurrency: string | null,
): Candidate[] {
  if (!contractCurrency) {
    return candidates;
  }
  return candidates.map((candidate) =>
    candidate.currency === null && candidate.amountValue !== null
      ? { ...candidate, currency: contractCurrency }
      : candidate,
  );
}
