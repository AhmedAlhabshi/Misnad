import type { ContractDuration } from "../contractDuration";
import type { CostDifferenceClassification, ObligationType } from "../enums";
import type { FeeCollection, FeeItem } from "../fee";
import type { MoneyMetric } from "../moneyMetric";
import type { PaymentObligation } from "../paymentObligation";
import type { PenaltyCollection, PenaltyItem } from "../penalty";
import type { RecurringCommitment } from "../recurringCommitment";
import type { TotalCost } from "../totalCost";
import { selectEligibleMandatoryFeeItems, selectEligibleOneTimeObligations } from "../pipeline/eligibility";
import { knownMoney, maxKnownMoneyMetric, sumKnownMoneyMetrics, unavailableMoney } from "../utils/metricFactories";
import { round2 } from "../utils/rounding";
import { emptyMetadata, mergeMetadata, type CalculatorMetadata } from "./metadata";

const RECURRING_FREQUENCIES = new Set(["daily", "weekly", "monthly", "quarterly", "semi_annual", "annual"]);

/**
 * Among one-time obligations, only a balloon/final payment repays the
 * financed principal — a down payment, an upfront fee-like obligation, a tax,
 * or any other one-time type reduces what needed to be financed (or is
 * otherwise unrelated to repayment) rather than repaying it. This is the
 * only scope distinction `financingRepaymentTotal` needs: everything else
 * one-time is "pre-financing" by exclusion, which is the conservative
 * default (never assumes an unclassified one-time obligation repays a loan).
 */
const FINANCING_REPAYMENT_ONE_TIME_TYPES: ReadonlySet<ObligationType> = new Set(["balloon_payment"]);

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

  const { eligible: eligibleMandatoryFees, unresolvedDeposits } = selectEligibleMandatoryFeeItems(items);
  for (const item of unresolvedDeposits) {
    metadata.excludedValues.push({
      value: item.amount.value,
      reasonCode: "deposit_refundability_unresolved",
      sourceField: item.sourceFields[0] ?? item.id,
    });
  }
  const mandatoryAmounts: MoneyMetric[] = eligibleMandatoryFees.map((item) => item.amount);

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
export function calculateTotalScheduledRecurring(
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
 * authority on what each field means — see the Milestone 5.6/5.6C
 * correction reports for the full rationale):
 *
 * - `calculatedBaseCost`: the principal/financed amount alone.
 * - `calculatedCoreObligations`/`calculatedKnownCost`: the guaranteed,
 *   normal-path *total cash outflow* — every mandatory, non-conditional
 *   one-time obligation (both pre-financing amounts like a down payment AND
 *   any balloon/final financing repayment), plus the scheduled recurring
 *   commitment over the known duration, plus mandatory non-conditional
 *   fees. `calculatedKnownCost` never additionally folds in
 *   conditional/contingent amounts (late fees, early-termination fees,
 *   deductibles) merely because their amount happens to be known — those
 *   remain fully visible in `fees.conditionalFees`, `penalties`, and
 *   `exposure.contingentExposure`. This total deliberately mixes scopes (a
 *   down payment is not part of what was financed, yet is included here) —
 *   see `financingRepaymentTotal`/`financingCost` below for the
 *   financing-only scope, and never derive a financing-cost percentage from
 *   this total directly.
 * - `financingRepaymentTotal`/`financingCost`: the financing-only scope —
 *   see `totalCost.ts`'s field docs. Computed from the *same* one-time
 *   obligations and recurring commitment as `calculatedCoreObligations`,
 *   just split by `ObligationType` (see `FINANCING_REPAYMENT_ONE_TIME_TYPES`)
 *   instead of merged, so this never requires re-deriving amounts from
 *   scratch or risks drifting out of sync with the cash-outflow total.
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

  const { eligible: eligibleOneTimeObligations, unresolvedDeposits } = selectEligibleOneTimeObligations(
    oneTimeGuaranteedObligations,
    obligationRefundability,
  );
  for (const obligation of unresolvedDeposits) {
    metadata.excludedValues.push({
      value: obligation.amount.value,
      reasonCode: "deposit_refundability_unresolved",
      sourceField: obligation.sourceFields[0] ?? obligation.id,
    });
  }

  // Split guaranteed one-time obligations by financial scope: a balloon/final
  // payment repays the financed principal (financing repayment); everything
  // else one-time (down payment, upfront fee-like obligation, tax, ...) is
  // pre-financing cash paid outside the loan itself. This is the only split
  // needed — both sums recombine into the same `calculatedCoreObligations`
  // total as before, so that total's value never changes; only the
  // financing-only scope becomes separately available.
  const financingRepaymentOneTime = eligibleOneTimeObligations.filter((obligation) =>
    FINANCING_REPAYMENT_ONE_TIME_TYPES.has(obligation.type),
  );
  const preFinancingOneTime = eligibleOneTimeObligations.filter(
    (obligation) => !FINANCING_REPAYMENT_ONE_TIME_TYPES.has(obligation.type),
  );

  const preFinancingOneTimeTotal = sumKnownMoneyMetrics(
    preFinancingOneTime.map((obligation) => obligation.amount),
    "sum of mandatory pre-financing one-time obligations (confirmed non-refundable, for deposits)",
    "no mandatory pre-financing one-time obligation has a fully known, confirmed non-refundable amount",
  );
  const financingRepaymentOneTimeTotal = sumKnownMoneyMetrics(
    financingRepaymentOneTime.map((obligation) => obligation.amount),
    "sum of balloon/final financing repayment obligations",
    "no balloon or final financing repayment obligation has a fully known amount",
  );

  const { result: totalScheduledRecurring, metadata: recurringMetadata } = calculateTotalScheduledRecurring(
    recurringCommitment,
    contractDuration,
  );

  // The scheduled repayment total (recurring commitment + any balloon) is
  // computed once and reused for both `calculatedCoreObligations` (always,
  // regardless of contract type) and the publicly-exposed
  // `financingRepaymentTotal` (only when a financed principal is known — see
  // the applicability gate below).
  const scheduledRepaymentTotal = sumKnownMoneyMetrics(
    [totalScheduledRecurring, financingRepaymentOneTimeTotal],
    "sum of scheduled recurring repayment and any balloon/final repayment",
    "no scheduled repayment amount is known",
  );

  const coreParts = [preFinancingOneTimeTotal, scheduledRepaymentTotal, mandatoryFees];
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

  // `financingRepaymentTotal` only applies when this contract actually
  // finances a principal amount — a lease's cumulative rent or a
  // subscription's cumulative billing is not "financing repayment", even
  // though it goes through the same recurring-commitment machinery. Reusing
  // `principal.status` (the "was a financed/loan amount found" signal that
  // already exists for every contract type) as the applicability gate avoids
  // any new contract-type-specific special-casing.
  const financingRepaymentTotal: MoneyMetric =
    principal.status === "known"
      ? scheduledRepaymentTotal
      : unavailableMoney(
          "no financed principal was found in the contract — this metric only applies when a principal/financed amount is known",
        );

  const financingCost: MoneyMetric =
    financingRepaymentTotal.value !== null &&
    financingRepaymentTotal.currency !== null &&
    principal.value !== null &&
    principal.currency !== null &&
    financingRepaymentTotal.currency === principal.currency &&
    principal.value !== 0 &&
    financingRepaymentTotal.value >= principal.value
      ? knownMoney(financingRepaymentTotal.value - principal.value, principal.currency, "financingRepaymentTotal - calculatedBaseCost")
      : unavailableMoney(
          "financingRepaymentTotal and the financed principal must both be known, non-zero, in the same currency, and repayment must not be below principal",
        );

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
      financingRepaymentTotal,
      financingCost,
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
