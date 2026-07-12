import type { CalculatorMetadata } from "../calculators/metadata";
import type { FeeItem } from "../fee";
import type { MoneyMetric } from "../moneyMetric";
import type { PaymentObligation } from "../paymentObligation";
import type { PenaltyItem } from "../penalty";
import type { PercentageMetric } from "../percentageMetric";
import { knownMoney, knownPercentage, unavailableMoney, unavailablePercentage } from "../utils/metricFactories";
import type { Candidate } from "./candidates";

/**
 * Converts a resolved candidate's amount into a `MoneyMetric`. An amount
 * whose currency could not be determined anywhere in the document is never
 * expressed as a fabricated-currency "known" value — it is recorded as an
 * excluded value and reported as unavailable instead.
 */
export function candidateToMoneyMetric(candidate: Candidate, metadata: CalculatorMetadata): MoneyMetric {
  if (candidate.amountValue === null) {
    return unavailableMoney("no amount was stated for this item", candidate.sourceField);
  }
  if (candidate.currency === null) {
    metadata.excludedValues.push({
      value: candidate.amountValue,
      reasonCode: "currency_unresolved",
      sourceField: candidate.sourceField,
    });
    return unavailableMoney("an amount was found but its currency could not be determined", candidate.sourceField);
  }
  return knownMoney(candidate.amountValue, candidate.currency, candidate.sourceField, candidate.confidence);
}

export function candidateToPercentageMetric(candidate: Candidate): PercentageMetric {
  if (candidate.percentageValue === null) {
    return unavailablePercentage("no percentage was stated for this item", candidate.sourceField);
  }
  return knownPercentage(candidate.percentageValue, candidate.sourceField, candidate.confidence);
}

function bySourceField(a: Candidate, b: Candidate): number {
  return a.sourceField.localeCompare(b.sourceField);
}

export function buildPaymentObligations(
  candidates: readonly Candidate[],
  metadata: CalculatorMetadata,
): PaymentObligation[] {
  return [...candidates].sort(bySourceField).map((candidate, index) => ({
    id: `obligation-${index}`,
    label: candidate.label,
    type: candidate.obligationType ?? "unknown",
    amount: candidateToMoneyMetric(candidate, metadata),
    frequency: candidate.frequency ?? "unknown",
    numberOfPayments: candidate.numberOfPayments,
    startDate: candidate.startDate,
    endDate: candidate.endDate,
    mandatory: candidate.mandatory,
    conditional: candidate.conditional,
    sourceFields: [candidate.sourceField],
  }));
}

/**
 * `PaymentObligation` (a Milestone 5.5 public schema type) has no
 * `refundable` field — only the internal `Candidate` does. This map lets
 * calculators look up a built obligation's source candidate's refundable
 * signal by id (using the exact same sort/id-assignment as
 * `buildPaymentObligations`) without adding a field to the public schema.
 */
export function buildObligationRefundabilityMap(candidates: readonly Candidate[]): ReadonlyMap<string, boolean | null> {
  const map = new Map<string, boolean | null>();
  [...candidates].sort(bySourceField).forEach((candidate, index) => {
    map.set(`obligation-${index}`, candidate.refundable);
  });
  return map;
}

export function buildFeeItems(candidates: readonly Candidate[], metadata: CalculatorMetadata): FeeItem[] {
  return [...candidates].sort(bySourceField).map((candidate, index) => ({
    id: `fee-${index}`,
    type: candidate.feeType ?? "other",
    label: candidate.label,
    amount: candidateToMoneyMetric(candidate, metadata),
    percentage: candidateToPercentageMetric(candidate),
    calculationBase: candidate.calculationBase,
    frequency: candidate.frequency,
    mandatory: candidate.mandatory,
    conditional: candidate.conditional,
    refundable: candidate.refundable,
    sourceFields: [candidate.sourceField],
  }));
}

export function buildPenaltyItems(candidates: readonly Candidate[], metadata: CalculatorMetadata): PenaltyItem[] {
  return [...candidates].sort(bySourceField).map((candidate, index) => ({
    id: `penalty-${index}`,
    type: candidate.penaltyType ?? "other",
    label: candidate.label,
    amount: candidateToMoneyMetric(candidate, metadata),
    percentage: candidateToPercentageMetric(candidate),
    calculationBase: candidate.calculationBase,
    trigger: candidate.trigger,
    maximumAmount: unavailableMoney("no maximum amount was stated for this penalty", candidate.sourceField),
    conditional: candidate.conditional ?? true,
    sourceFields: [candidate.sourceField],
  }));
}
