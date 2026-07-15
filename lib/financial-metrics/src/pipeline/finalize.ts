import type { CalculatorMetadata } from "../calculators/metadata";
import type { FeeItem } from "../fee";
import type { InformationalAmount, InformationalAmountType } from "../informationalAmount";
import type { MoneyMetric } from "../moneyMetric";
import type { PaymentObligation } from "../paymentObligation";
import type { PenaltyItem } from "../penalty";
import type { PercentageMetric } from "../percentageMetric";
import { knownMoney, knownPercentage, unavailableMoney, unavailablePercentage } from "../utils/metricFactories";
import type { Candidate, SpecialValueKey } from "./candidates";
import { isEligiblePaymentObligation } from "./eligibility";
import { toFinancialRole } from "./semantics";

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

/**
 * A candidate whose `semanticRole`/`context` disqualifies it (asset value,
 * principal, a scenario amount, a reference-only figure, ...) can never
 * become a `PaymentObligation` — it is recorded as an excluded value instead
 * of silently vanishing. Shared by `buildPaymentObligations` and
 * `buildObligationRefundabilityMap` so both use the exact same filtered,
 * sorted candidate list and therefore the exact same `obligation-N` ids.
 */
function selectEligibleObligationCandidates(
  candidates: readonly Candidate[],
  metadata: CalculatorMetadata,
): Candidate[] {
  const sorted = [...candidates].sort(bySourceField);
  const eligible: Candidate[] = [];
  for (const candidate of sorted) {
    if (isEligiblePaymentObligation(candidate.semanticRole, candidate.context)) {
      eligible.push(candidate);
      continue;
    }
    metadata.excludedValues.push({
      value: candidate.amountValue,
      reasonCode: `not_a_payment_obligation:${candidate.semanticRole}:${candidate.context}`,
      sourceField: candidate.sourceField,
    });
  }
  return eligible;
}

export function buildPaymentObligations(
  candidates: readonly Candidate[],
  metadata: CalculatorMetadata,
): PaymentObligation[] {
  return selectEligibleObligationCandidates(candidates, metadata).map((candidate, index) => ({
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
    refundable: candidate.refundable,
    financialRole: toFinancialRole(candidate.semanticRole, candidate.frequency, candidate.refundable, candidate.paymentTiming),
    sourceFields: [candidate.sourceField],
  }));
}

/**
 * `PaymentObligation` (a Milestone 5.5 public schema type) has no
 * `refundable` field — only the internal `Candidate` does. This map lets
 * calculators look up a built obligation's source candidate's refundable
 * signal by id (using the exact same eligibility filter, sort, and
 * id-assignment as `buildPaymentObligations`) without adding a field to the
 * public schema. Uses a throwaway metadata sink so the same exclusions are
 * not double-reported alongside `buildPaymentObligations`'s own call.
 */
export function buildObligationRefundabilityMap(candidates: readonly Candidate[]): ReadonlyMap<string, boolean | null> {
  const map = new Map<string, boolean | null>();
  const throwawayMetadata: CalculatorMetadata = { formulas: [], unavailable: [], warnings: [], excludedValues: [] };
  selectEligibleObligationCandidates(candidates, throwawayMetadata).forEach((candidate, index) => {
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
    financialRole: toFinancialRole(candidate.semanticRole, candidate.frequency, candidate.refundable, candidate.paymentTiming),
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
    financialRole: toFinancialRole(candidate.semanticRole, candidate.frequency, candidate.refundable, candidate.paymentTiming),
    sourceFields: [candidate.sourceField],
  }));
}

/** Internal `SpecialValueKey` (camelCase, extraction-side) → public `InformationalAmountType` (snake_case, stable presentation-facing name). */
const SPECIAL_KEY_TO_INFORMATIONAL_TYPE: Record<SpecialValueKey, InformationalAmountType> = {
  principal: "principal",
  creditLimit: "credit_limit",
  outstandingBalance: "outstanding_balance",
  monthlyIncome: "monthly_income",
  statedTotalCost: "stated_total_cost",
  insuranceDeductible: "insurance_deductible",
  coverageAmount: "coverage_amount",
  rate: "rate",
};

/**
 * Resolves a candidate's public `InformationalAmountType`. Most candidates
 * here carry a `specialKey` set during extraction (principal, credit limit,
 * income, ...); the one exception is a generic, free-text-classified
 * `asset_value` candidate (e.g. a vehicle's cash price or a property's
 * value) — it has no dedicated `SpecialValueKey` because no contract type's
 * `typeDetails` schema has an "asset value" field, so its role
 * (`semanticRole === "asset_value"`, assigned purely from label/description
 * text — see `classify.ts`'s `isAssetValueText`) is the only signal.
 */
function resolveInformationalAmountType(candidate: Candidate): InformationalAmountType {
  if (candidate.specialKey) {
    return SPECIAL_KEY_TO_INFORMATIONAL_TYPE[candidate.specialKey];
  }
  return "asset_value";
}

/**
 * Builds the public `informationalAmounts[]` collection from every
 * `special`-targetKind candidate (principal, credit limit, coverage amount,
 * income, a stated deductible, an outstanding balance, a stated grand
 * total, or a stated rate/APR), plus any generically-classified
 * `asset_value`-role candidate (a stated reference/collateral value with no
 * dedicated `typeDetails` field — see `resolveInformationalAmountType`).
 * These candidates were already extracted and classified — this only makes
 * them individually inspectable, mirroring `buildFeeItems`/`buildPenaltyItems`.
 * Never eligible to become a `PaymentObligation` (see
 * `pipeline/eligibility.ts`), so there is no risk of a principal/limit/asset
 * value double-counting as a payment obligation here.
 */
export function buildInformationalAmounts(candidates: readonly Candidate[], metadata: CalculatorMetadata): InformationalAmount[] {
  return [...candidates]
    .filter((candidate) => candidate.specialKey !== undefined || candidate.semanticRole === "asset_value")
    .sort(bySourceField)
    .map((candidate, index) => ({
      id: `informational-${index}`,
      type: resolveInformationalAmountType(candidate),
      label: candidate.label,
      amount: candidateToMoneyMetric(candidate, metadata),
      percentage: candidateToPercentageMetric(candidate),
      financialRole: toFinancialRole(candidate.semanticRole, candidate.frequency, candidate.refundable, candidate.paymentTiming),
      sourceFields: [candidate.sourceField],
    }));
}
