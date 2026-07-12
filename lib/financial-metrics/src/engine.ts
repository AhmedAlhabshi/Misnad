import { contractUnderstandingSchema, type ContractUnderstanding } from "@workspace/contract-schema";
import { calculateRecurringCommitment, monthlyEquivalentFactor } from "./calculators/commitments";
import { buildFeeCollection, buildPenaltyCollection, calculateTotalCost } from "./calculators/costs";
import { calculateContractDuration } from "./calculators/duration";
import { calculateExposure } from "./calculators/exposure";
import { emptyMetadata, mergeMetadata } from "./calculators/metadata";
import { calculateRatios } from "./calculators/ratios";
import { FINANCIAL_METRICS_SCHEMA_VERSION, financialMetricsSchema, type FinancialMetrics } from "./financialMetrics";
import { invalidInputError, invalidReferenceDateError, outputValidationFailedError } from "./errors";
import { normalizeToIsoDate } from "./normalize/dates";
import type { Candidate, SpecialValueKey } from "./pipeline/candidates";
import { extractCandidates } from "./pipeline/candidates";
import {
  backfillCandidateCurrencies,
  describeCurrencyDistribution,
  resolveContractCurrency,
  resolveConflicts,
} from "./pipeline/conflicts";
import { deduplicateCandidates } from "./pipeline/dedupe";
import {
  buildFeeItems,
  buildObligationRefundabilityMap,
  buildPaymentObligations,
  buildPenaltyItems,
  candidateToMoneyMetric,
} from "./pipeline/finalize";
import type { MoneyMetric } from "./moneyMetric";
import { knownMoney, unavailableMoney } from "./utils/metricFactories";

export interface FinancialMetricsEngineOptions {
  /**
   * An explicit calendar date (`YYYY-MM-DD`) the engine may use for any
   * current-date-dependent calculation. The engine never calls `new Date()`
   * to read the system clock — when this is omitted, every metric that
   * would depend on "today" is left `null`/unavailable rather than silently
   * using a changing current date.
   */
  referenceDate?: string;
}

function resolveSpecialCandidateMap(candidates: readonly Candidate[]): Map<SpecialValueKey, Candidate> {
  const map = new Map<SpecialValueKey, Candidate>();
  for (const candidate of candidates) {
    if (candidate.targetKind === "special" && candidate.specialKey) {
      map.set(candidate.specialKey, candidate);
    }
  }
  return map;
}

function resolveSpecialMoney(
  specialMap: Map<SpecialValueKey, Candidate>,
  key: SpecialValueKey,
  reason: string,
  metadata: ReturnType<typeof emptyMetadata>,
): MoneyMetric {
  const candidate = specialMap.get(key);
  if (!candidate) {
    return unavailableMoney(reason);
  }
  return candidateToMoneyMetric(candidate, metadata);
}

/** Converts a special-value candidate (e.g. an annual salary) to a monthly figure using the same explicit, valid-frequency-only conversion rules as recurring commitments — never a guessed cadence. */
function resolveMonthlyIncome(
  specialMap: Map<SpecialValueKey, Candidate>,
  metadata: ReturnType<typeof emptyMetadata>,
): MoneyMetric {
  const candidate = specialMap.get("monthlyIncome");
  if (!candidate || candidate.amountValue === null) {
    return unavailableMoney("no reliable monthly income was found in the contract");
  }
  if (candidate.currency === null) {
    metadata.excludedValues.push({
      value: candidate.amountValue,
      reasonCode: "currency_unresolved",
      sourceField: candidate.sourceField,
    });
    return unavailableMoney("an income amount was found but its currency could not be determined");
  }
  if (candidate.frequency === "monthly") {
    return knownMoney(candidate.amountValue, candidate.currency, candidate.sourceField);
  }
  const factor = candidate.frequency ? monthlyEquivalentFactor(candidate.frequency) : null;
  if (factor === null) {
    return unavailableMoney("the stated income has no explicit, convertible pay frequency");
  }
  return knownMoney(candidate.amountValue * factor, candidate.currency, `${candidate.sourceField} (converted to a monthly figure)`);
}

/**
 * Converts validated Milestone 4 `ContractUnderstanding` JSON into validated
 * Milestone 5.5 `FinancialMetrics` JSON. Deterministic and pure: the same
 * input and options always produce the same output, with no AI calls, no
 * network access, and no reliance on the system clock.
 */
export function calculateFinancialMetrics(
  input: ContractUnderstanding,
  options: FinancialMetricsEngineOptions = {},
): FinancialMetrics {
  const parsedInput = contractUnderstandingSchema.safeParse(input);
  if (!parsedInput.success) {
    throw invalidInputError(
      `input is not a valid ContractUnderstanding: ${parsedInput.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }

  if (options.referenceDate !== undefined && normalizeToIsoDate(options.referenceDate) !== options.referenceDate) {
    throw invalidReferenceDateError(options.referenceDate);
  }

  const understanding = parsedInput.data;

  // Currency is resolved and backfilled *before* dedup/conflict-resolution:
  // typeDetails-derived candidates never carry their own currency, so
  // without this ordering they could never be recognized as duplicates of
  // (or conflicts with) a currency-bearing candidate for the same item from
  // another Milestone 4 location.
  const { candidates } = extractCandidates(understanding);
  const contractCurrency = resolveContractCurrency(candidates);
  const currencyResolved = backfillCandidateCurrencies(candidates, contractCurrency);
  const { candidates: deduped } = deduplicateCandidates(currencyResolved);
  const { candidates: finalCandidates, conflicts } = resolveConflicts(deduped);

  const obligationCandidates = finalCandidates.filter((candidate) => candidate.targetKind === "obligation");
  const feeCandidates = finalCandidates.filter((candidate) => candidate.targetKind === "fee");
  const penaltyCandidates = finalCandidates.filter((candidate) => candidate.targetKind === "penalty");
  const specialMap = resolveSpecialCandidateMap(finalCandidates);

  const metadata = emptyMetadata();

  const paymentObligations = buildPaymentObligations(obligationCandidates, metadata);
  const obligationRefundability = buildObligationRefundabilityMap(obligationCandidates);
  const feeItems = buildFeeItems(feeCandidates, metadata);
  const penaltyItems = buildPenaltyItems(penaltyCandidates, metadata);

  const { result: fees, metadata: feeMetadata } = buildFeeCollection(feeItems);
  const { result: penalties, metadata: penaltyMetadata } = buildPenaltyCollection(penaltyItems);

  const contractDuration = calculateContractDuration(understanding, obligationCandidates);
  const { result: recurringCommitment, metadata: commitmentMetadata } = calculateRecurringCommitment(paymentObligations);

  const principal = resolveSpecialMoney(specialMap, "principal", "no principal or financed amount was found in the contract", metadata);
  const statedTotalCost = resolveSpecialMoney(specialMap, "statedTotalCost", "no stated total cost was found in the contract text", metadata);
  const insuranceDeductible = resolveSpecialMoney(specialMap, "insuranceDeductible", "no insurance deductible was found in the contract", metadata);
  const monthlyIncome = resolveMonthlyIncome(specialMap, metadata);

  const balloonPaymentAmount =
    paymentObligations.find((obligation) => obligation.type === "balloon_payment")?.amount ??
    unavailableMoney("no balloon or final payment was found in the contract");

  const { result: totalCost, metadata: costMetadata } = calculateTotalCost(
    principal,
    paymentObligations,
    obligationRefundability,
    fees.mandatoryFees,
    recurringCommitment,
    contractDuration,
    statedTotalCost,
  );

  const { result: exposure, metadata: exposureMetadata } = calculateExposure(
    paymentObligations,
    feeItems,
    fees,
    penalties,
    recurringCommitment,
    totalCost.calculatedCoreObligations,
    insuranceDeductible,
  );

  const { result: ratios, metadata: ratioMetadata } = calculateRatios(
    principal,
    fees.mandatoryFees,
    penalties.totalKnownPenalties,
    exposure.upfrontExposure,
    balloonPaymentAmount,
    totalCost.calculatedKnownCost,
    recurringCommitment.monthlyEquivalent,
    monthlyIncome,
  );

  // The distribution below (e.g. "SAR: 10, USD: 1") is purely informational
  // — it must never be used to backfill a currency or affect any
  // calculation. `contractCurrency` (the only value that does) is `null`
  // here precisely because more than one currency is present, regardless
  // of how lopsided the count is.
  const currencyDistribution = describeCurrencyDistribution(finalCandidates);
  const mixedCurrencyWarnings =
    finalCandidates.some((candidate) => candidate.currency !== null) && contractCurrency === null
      ? [
          {
            code: "MIXED_CURRENCY",
            severity: "medium" as const,
            messageKey: "contract_currency_ambiguous",
            sourceFields: finalCandidates.filter((candidate) => candidate.currency !== null).map((candidate) => candidate.sourceField),
            details: currencyDistribution
              ? `more than one currency is present; no single currency can be backfilled or used as the root currency (non-authoritative distribution: ${currencyDistribution})`
              : "more than one currency is present; no single currency can be backfilled or used as the root currency",
          },
        ]
      : [];

  const merged = mergeMetadata(
    metadata,
    feeMetadata,
    penaltyMetadata,
    commitmentMetadata,
    costMetadata,
    exposureMetadata,
    ratioMetadata,
    { ...emptyMetadata(), warnings: mixedCurrencyWarnings },
  );

  const result: FinancialMetrics = {
    schemaVersion: FINANCIAL_METRICS_SCHEMA_VERSION,
    currency: contractCurrency,
    paymentObligations,
    recurringCommitment,
    contractDuration,
    totalCost,
    fees,
    penalties,
    ratios,
    exposure,
    // Milestone 5.6's scope covers deterministic calculation only; surfacing
    // qualitative "positive factors" would require judgment calls this
    // milestone deliberately does not make (see the final report).
    positiveFinancialFactors: [],
    calculationMetadata: {
      formulasUsed: merged.formulas,
      unavailableCalculations: [...new Set(merged.unavailable)],
      warnings: merged.warnings,
      conflicts,
      excludedValues: merged.excludedValues,
    },
  };

  const validated = financialMetricsSchema.safeParse(result);
  if (!validated.success) {
    throw outputValidationFailedError(validated.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }

  return validated.data;
}
