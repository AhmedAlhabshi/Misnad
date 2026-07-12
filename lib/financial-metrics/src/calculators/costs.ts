import type { ContractDuration } from "../contractDuration";
import type { CostDifferenceClassification } from "../enums";
import type { FeeCollection, FeeItem } from "../fee";
import type { MoneyMetric } from "../moneyMetric";
import type { PaymentObligation } from "../paymentObligation";
import type { PenaltyCollection, PenaltyItem } from "../penalty";
import type { RecurringCommitment } from "../recurringCommitment";
import type { TotalCost } from "../totalCost";
import { isDepositLikeText } from "../pipeline/classify";
import { knownMoney, maxKnownMoneyMetric, sumKnownMoneyMetrics, unavailableMoney } from "../utils/metricFactories";
import { round2 } from "../utils/rounding";
import { emptyMetadata, mergeMetadata, type CalculatorMetadata } from "./metadata";

function isGuaranteed(mandatory: boolean | null, conditional: boolean | null): boolean {
  return mandatory === true && conditional !== true;
}

const RECURRING_FREQUENCIES = new Set(["daily", "weekly", "monthly", "quarterly", "semi_annual", "annual"]);

export function buildFeeCollection(items: readonly FeeItem[]): { result: FeeCollection; metadata: CalculatorMetadata } {
  const metadata = emptyMetadata();

  if (items.length === 0) {
    const reason = "no fees were found in the contract";
    return {
      result: {
        items: [],
        totalKnownFees: unavailableMoney(reason),
        mandatoryFees: unavailableMoney(reason),
        upfrontFees: unavailableMoney(reason),
        recurringFees: unavailableMoney(reason),
        conditionalFees: unavailableMoney(reason),
        hasUndefinedFees: null,
        status: "unavailable",
      },
      metadata,
    };
  }

  // A deposit's refundability is a genuinely open question (unlike an
  // ordinary fee, which is conventionally non-refundable): explicitly
  // refundable is excluded (it is not a real cost), explicitly
  // non-refundable is included, and — critically — *unknown* refundability
  // is excluded from guaranteed cost too, but flagged as an excluded value
  // rather than silently assumed either way.
  const mandatoryAmounts: MoneyMetric[] = [];
  for (const item of items) {
    if (!isGuaranteed(item.mandatory, item.conditional)) {
      continue;
    }
    if (isDepositLikeText(item.label)) {
      if (item.refundable === true) {
        continue;
      }
      if (item.refundable === null) {
        metadata.excludedValues.push({
          value: item.amount.value,
          reasonCode: "deposit_refundability_unresolved",
          sourceField: item.sourceFields[0] ?? item.id,
        });
        continue;
      }
      // item.refundable === false: confirmed non-refundable, falls through.
    } else if (item.refundable === true) {
      continue;
    }
    mandatoryAmounts.push(item.amount);
  }

  const upfrontAmounts = items.filter((item) => item.frequency === "one_time").map((item) => item.amount);
  const recurringAmounts = items
    .filter((item) => item.frequency !== null && RECURRING_FREQUENCIES.has(item.frequency))
    .map((item) => item.amount);
  const conditionalAmounts = items.filter((item) => item.conditional === true).map((item) => item.amount);

  const hasUndefinedFees = items.some(
    (item) => item.amount.status !== "known" || (item.percentage.status === "known" && item.amount.status !== "known"),
  );

  const totalKnownFees = sumKnownMoneyMetrics(
    items.map((item) => item.amount),
    "sum of all known fee amounts",
    "no fee has a fully known amount and currency",
  );

  return {
    result: {
      items: [...items],
      totalKnownFees,
      mandatoryFees: sumKnownMoneyMetrics(mandatoryAmounts, "sum of mandatory, non-conditional, confirmed non-refundable fees", "no mandatory fee has a fully known, confirmed non-refundable amount"),
      upfrontFees: sumKnownMoneyMetrics(upfrontAmounts, "sum of one-time fees", "no one-time fee has a fully known amount"),
      recurringFees: sumKnownMoneyMetrics(recurringAmounts, "sum of recurring fees", "no recurring fee has a fully known amount"),
      conditionalFees: sumKnownMoneyMetrics(conditionalAmounts, "sum of conditional fees", "no conditional fee has a fully known amount"),
      hasUndefinedFees,
      status: totalKnownFees.status === "known" ? (hasUndefinedFees ? "estimated" : "known") : "unavailable",
    },
    metadata,
  };
}

export function buildPenaltyCollection(items: readonly PenaltyItem[]): { result: PenaltyCollection; metadata: CalculatorMetadata } {
  if (items.length === 0) {
    const reason = "no penalties were found in the contract";
    return {
      result: {
        items: [],
        totalKnownPenalties: unavailableMoney(reason),
        highestKnownPenalty: unavailableMoney(reason),
        hasUndefinedPenalty: null,
        status: "unavailable",
      },
      metadata: emptyMetadata(),
    };
  }

  const amounts = items.map((item) => item.amount);
  const hasUndefinedPenalty = items.some((item) => item.amount.status !== "known");
  const totalKnownPenalties = sumKnownMoneyMetrics(amounts, "sum of all known penalty amounts", "no penalty has a fully known amount");
  const highestKnownPenalty = maxKnownMoneyMetric(amounts, "highest known penalty amount", "no penalty has a fully known amount");

  return {
    result: {
      items: [...items],
      totalKnownPenalties,
      highestKnownPenalty,
      hasUndefinedPenalty,
      status: totalKnownPenalties.status === "known" ? (hasUndefinedPenalty ? "estimated" : "known") : "unavailable",
    },
    metadata: emptyMetadata(),
  };
}

/** Priority: explicit installment amount × explicit count (not yet populated by Milestone 4) → recurring monthly equivalent × known duration in months → unavailable. */
function calculateTotalScheduledRecurring(
  recurringCommitment: RecurringCommitment,
  contractDuration: ContractDuration,
): { result: MoneyMetric; metadata: CalculatorMetadata } {
  if (
    recurringCommitment.monthlyEquivalent.value !== null &&
    recurringCommitment.monthlyEquivalent.currency !== null &&
    contractDuration.months !== null
  ) {
    const value = recurringCommitment.monthlyEquivalent.value * contractDuration.months;
    return {
      result: knownMoney(value, recurringCommitment.monthlyEquivalent.currency, "monthlyEquivalent × contractDuration.months"),
      metadata: {
        ...emptyMetadata(),
        formulas: [
          {
            metric: "totalScheduledRecurring",
            formula: "monthlyEquivalent × contractDuration.months",
            inputs: { monthlyEquivalent: recurringCommitment.monthlyEquivalent.value, months: contractDuration.months },
            result: round2(value),
            status: "known",
          },
        ],
      },
    };
  }
  return {
    result: unavailableMoney("recurring commitment or contract duration in months is not known"),
    metadata: { ...emptyMetadata(), unavailable: ["totalScheduledRecurring"] },
  };
}

function classifyDifference(stated: number, calculated: number): CostDifferenceClassification {
  if (stated === 0) {
    return "unavailable";
  }
  const relative = Math.abs(stated - calculated) / Math.abs(stated);
  if (relative < 0.005) {
    return "match";
  }
  if (relative < 0.02) {
    return "rounding";
  }
  if (relative < 0.1) {
    return "warning";
  }
  return "conflict";
}

/**
 * Milestone 5.5 field semantics used by this calculator (no field-level
 * docs were committed with the schema itself, so this engine is the
 * authority on what each field means — see the Milestone 5.6 correction
 * report for the full rationale):
 *
 * - `calculatedBaseCost`: the principal/financed amount alone.
 * - `calculatedCoreObligations`: the guaranteed, normal-path total — one-time
 *   obligations that are mandatory, non-conditional, and (for deposits)
 *   *confirmed* non-refundable, plus the scheduled recurring commitment
 *   over the known duration, plus mandatory non-conditional fees.
 * - `calculatedKnownCost`: the same known, normal-path total as
 *   `calculatedCoreObligations`. It never adds conditional/contingent
 *   amounts (late fees, early-termination fees, deductibles, other
 *   event-triggered charges) merely because their amount happens to be
 *   known — a known amount does not make an event-triggered charge part of
 *   the guaranteed cost of the normal contract path. Those amounts remain
 *   fully visible in `fees.conditionalFees`, `penalties`, and
 *   `exposure.contingentExposure`.
 */
export function calculateTotalCost(
  principal: MoneyMetric,
  oneTimeGuaranteedObligations: readonly PaymentObligation[],
  obligationRefundability: ReadonlyMap<string, boolean | null>,
  mandatoryFees: MoneyMetric,
  recurringCommitment: RecurringCommitment,
  contractDuration: ContractDuration,
  statedTotalCost: MoneyMetric,
): { result: TotalCost; metadata: CalculatorMetadata } {
  const metadata = emptyMetadata();

  // A deposit's refundability is a genuinely open question: explicitly
  // refundable is excluded (not a real cost), explicitly non-refundable is
  // included, and unresolved is excluded too but flagged — never silently
  // assumed either way. Non-deposit one-time obligations (down payments,
  // balloon payments) are unaffected; refundability was never a relevant
  // question for them.
  const oneTimeAmounts: MoneyMetric[] = [];
  for (const obligation of oneTimeGuaranteedObligations) {
    if (!isGuaranteed(obligation.mandatory, obligation.conditional) || obligation.frequency !== "one_time") {
      continue;
    }
    if (obligation.type === "deposit") {
      const refundable = obligationRefundability.get(obligation.id) ?? null;
      if (refundable === true) {
        continue;
      }
      if (refundable === null) {
        metadata.excludedValues.push({
          value: obligation.amount.value,
          reasonCode: "deposit_refundability_unresolved",
          sourceField: obligation.sourceFields[0] ?? obligation.id,
        });
        continue;
      }
      // refundable === false: confirmed non-refundable, falls through.
    }
    oneTimeAmounts.push(obligation.amount);
  }
  const oneTimeTotal = sumKnownMoneyMetrics(
    oneTimeAmounts,
    "sum of mandatory one-time obligations (confirmed non-refundable, for deposits)",
    "no mandatory one-time obligation has a fully known, confirmed non-refundable amount",
  );

  const { result: totalScheduledRecurring, metadata: recurringMetadata } = calculateTotalScheduledRecurring(
    recurringCommitment,
    contractDuration,
  );

  const coreParts = [oneTimeTotal, totalScheduledRecurring, mandatoryFees];
  const calculatedCoreObligations = sumKnownMoneyMetrics(
    coreParts,
    "sum of guaranteed one-time obligations, scheduled recurring commitment, and mandatory fees",
    "not enough guaranteed cost components are known",
  );

  // See the doc comment above: calculatedKnownCost intentionally equals
  // calculatedCoreObligations — conditional/contingent amounts are never
  // folded in, even when their amount is known.
  const calculatedKnownCost: MoneyMetric =
    calculatedCoreObligations.status === "known"
      ? { ...calculatedCoreObligations, source: "equals calculatedCoreObligations (conditional/contingent amounts excluded)" }
      : calculatedCoreObligations;

  const hasGaps = contractDuration.status !== "known" || calculatedCoreObligations.status !== "known";

  const estimatedContractCost: MoneyMetric =
    calculatedKnownCost.status === "known"
      ? hasGaps
        ? { ...calculatedKnownCost, status: "estimated", reason: "some cost components are estimated or unresolved" }
        : calculatedKnownCost
      : calculatedKnownCost;

  let differenceFromStated: TotalCost["differenceFromStated"];
  if (
    statedTotalCost.value !== null &&
    statedTotalCost.currency !== null &&
    calculatedCoreObligations.value !== null &&
    calculatedCoreObligations.currency !== null &&
    statedTotalCost.currency === calculatedCoreObligations.currency
  ) {
    const classification = classifyDifference(statedTotalCost.value, calculatedCoreObligations.value);
    differenceFromStated = {
      classification,
      amount: knownMoney(Math.abs(statedTotalCost.value - calculatedCoreObligations.value), statedTotalCost.currency, "abs(statedTotalCost - calculatedCoreObligations)"),
      reason: null,
    };
  } else {
    differenceFromStated = {
      classification: "unavailable",
      amount: unavailableMoney("a stated total cost or a comparable calculated cost is not known"),
      reason: "cannot compare a stated total cost against a calculated cost without both being known in the same currency",
    };
  }

  return {
    result: {
      statedTotalCost,
      calculatedBaseCost: principal,
      calculatedCoreObligations,
      calculatedKnownCost,
      estimatedContractCost,
      differenceFromStated,
    },
    metadata: mergeMetadata(metadata, recurringMetadata, {
      ...emptyMetadata(),
      unavailable: [
        ...(calculatedCoreObligations.status !== "known" ? ["totalCost.calculatedCoreObligations"] : []),
        ...(principal.status !== "known" ? ["totalCost.calculatedBaseCost"] : []),
      ],
    }),
  };
}
