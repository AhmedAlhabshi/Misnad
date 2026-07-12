import type { Exposure } from "../exposure";
import type { FeeCollection, FeeItem } from "../fee";
import type { MoneyMetric } from "../moneyMetric";
import type { PaymentObligation } from "../paymentObligation";
import type { PenaltyCollection } from "../penalty";
import type { RecurringCommitment } from "../recurringCommitment";
import { knownMoney, maxKnownMoneyMetric, sumKnownMoneyMetrics } from "../utils/metricFactories";
import { emptyMetadata, type CalculatorMetadata } from "./metadata";

/** Never merges currencies — one summed entry per distinct currency actually present. */
function computeTotalsByCurrency(amounts: readonly MoneyMetric[]): MoneyMetric[] {
  const sums = new Map<string, number>();
  for (const amount of amounts) {
    if (amount.status === "known" && amount.value !== null && amount.currency !== null) {
      sums.set(amount.currency, (sums.get(amount.currency) ?? 0) + amount.value);
    }
  }
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, total]) => knownMoney(total, currency, "sum of known amounts in this currency"));
}

/**
 * Credit limits are exposure the customer *could* draw on, never a
 * recurring commitment — the caller simply never passes a credit-limit
 * candidate into any of these sums, so it structurally cannot leak into
 * monthly/annual/guaranteed figures. An insurance deductible is likewise
 * kept out of `monthlyExposure`/`upfrontExposure` (it is not the premium)
 * and only ever contributes to `contingentExposure`.
 */
export function calculateExposure(
  obligations: readonly PaymentObligation[],
  feeItems: readonly FeeItem[],
  fees: FeeCollection,
  penalties: PenaltyCollection,
  recurringCommitment: RecurringCommitment,
  calculatedCoreObligations: MoneyMetric,
  insuranceDeductible: MoneyMetric,
): { result: Exposure; metadata: CalculatorMetadata } {
  const upfrontObligationAmounts = obligations
    .filter((obligation) => obligation.mandatory === true && obligation.frequency === "one_time")
    .map((obligation) => obligation.amount);
  const upfrontExposure = sumKnownMoneyMetrics(
    [...upfrontObligationAmounts, fees.upfrontFees],
    "sum of mandatory upfront obligations and upfront fees",
    "no upfront obligation or fee has a fully known amount",
  );

  const contingentExposure = sumKnownMoneyMetrics(
    [fees.conditionalFees, penalties.totalKnownPenalties, insuranceDeductible],
    "sum of conditional fees, penalties, and the insurance deductible",
    "no conditional exposure component has a fully known amount",
  );

  const hasUnresolvedConditionalFee = feeItems.some(
    (item) => item.conditional === true && item.amount.status !== "known",
  );
  const hasUnresolvedConditionalPenalty = penalties.items.some((item) => item.amount.status !== "known");
  const unquantifiedContingentExposure =
    penalties.items.length === 0 && feeItems.every((item) => item.conditional !== true)
      ? null
      : hasUnresolvedConditionalFee || hasUnresolvedConditionalPenalty;

  const allKnownAmounts: MoneyMetric[] = [
    ...obligations.map((obligation) => obligation.amount),
    ...feeItems.map((item) => item.amount),
    ...penalties.items.map((item) => item.amount),
  ];
  const maximumSinglePayment = maxKnownMoneyMetric(
    allKnownAmounts,
    "maximum known single payment across obligations, fees, and penalties",
    "no obligation, fee, or penalty has a fully known amount",
  );

  return {
    result: {
      totalKnownExposure: calculatedCoreObligations,
      monthlyExposure: recurringCommitment.monthlyEquivalent,
      annualExposure: recurringCommitment.annualEquivalent,
      upfrontExposure,
      contingentExposure,
      maximumSinglePayment,
      unquantifiedContingentExposure,
      totalsByCurrency: computeTotalsByCurrency(allKnownAmounts),
    },
    metadata: emptyMetadata(),
  };
}
