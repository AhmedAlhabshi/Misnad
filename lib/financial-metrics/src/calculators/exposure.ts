import type { Exposure } from "../exposure";
import type { FeeCollection, FeeItem } from "../fee";
import type { MoneyMetric } from "../moneyMetric";
import type { PaymentObligation } from "../paymentObligation";
import type { PenaltyCollection } from "../penalty";
import {
  isGuaranteed,
  isNormalPathExposureComponent,
  selectEligibleMandatoryFeeItems,
  selectEligibleOneTimeObligations,
} from "../pipeline/eligibility";
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
  obligationRefundability: ReadonlyMap<string, boolean | null>,
  totalScheduledRecurring: MoneyMetric,
): { result: Exposure; metadata: CalculatorMetadata } {
  // A balloon/final payment is financing repayment, not an upfront (pre-
  // financing) cash requirement — excluding it here mirrors the same
  // financial-scope split `costs.ts` applies to `financingRepaymentTotal`,
  // so `upfrontExposure`/`ratios.upfrontPaymentToBaseCost` are never
  // inflated by a loan's final repayment.
  const upfrontObligationAmounts = obligations
    .filter(
      (obligation) =>
        obligation.mandatory === true && obligation.frequency === "one_time" && obligation.type !== "balloon_payment",
    )
    .map((obligation) => obligation.amount);
  const upfrontExposure = sumKnownMoneyMetrics(
    [...upfrontObligationAmounts, fees.upfrontFees],
    "sum of mandatory upfront (pre-financing) obligations and upfront fees",
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

  // `maximumSinglePayment` is strictly "eligible actual payment obligations
  // and mandatory fees" (guaranteed: mandatory, non-conditional) — the same
  // strict gate `costs.ts` uses for `calculatedCoreObligations`, so it is
  // never inflated by asset values, principal, scenario amounts, or
  // conditional/optional charges (see `pipeline/eligibility.ts`).
  const { eligible: guaranteedOneTimeObligations } = selectEligibleOneTimeObligations(obligations, obligationRefundability);
  const { eligible: guaranteedMandatoryFees } = selectEligibleMandatoryFeeItems(feeItems);
  const maximumSinglePayment = maxKnownMoneyMetric(
    [...guaranteedOneTimeObligations.map((obligation) => obligation.amount), ...guaranteedMandatoryFees.map((item) => item.amount)],
    "maximum known eligible one-time obligation or mandatory fee amount",
    "no eligible one-time obligation or mandatory fee has a fully known amount",
  );

  // `totalsByCurrency` represents normal-path *known financial exposure*, a
  // broader concept than guaranteed cost: fees whose mandatory status is
  // simply unstated (`mandatory: null`, the conservative default in
  // `extractFromFees`) are still real, known amounts tied to the contract and
  // must not be dropped merely for lacking explicit "mandatory" wording —
  // only an explicit optional/conditional signal excludes them here (see
  // `isNormalPathExposureComponent`). Recurring obligations contribute via
  // the single, pre-computed `totalScheduledRecurring` for the currency it
  // resolved to; any *other* currency among eligible recurring obligations
  // (only possible when the contract mixes currencies, so no single
  // recurring total could be resolved) falls back to its own raw amounts so
  // that currency is never silently dropped.
  const { eligible: exposureEligibleFees } = selectEligibleMandatoryFeeItems(feeItems, isNormalPathExposureComponent);
  const eligibleRecurringObligations = obligations.filter(
    (obligation) => isGuaranteed(obligation.mandatory, obligation.conditional) && obligation.frequency !== "one_time",
  );
  const recurringFallbackAmounts = eligibleRecurringObligations
    .filter(
      (obligation) =>
        totalScheduledRecurring.status !== "known" || obligation.amount.currency !== totalScheduledRecurring.currency,
    )
    .map((obligation) => obligation.amount);

  const totalsByCurrency = computeTotalsByCurrency([
    ...guaranteedOneTimeObligations.map((obligation) => obligation.amount),
    ...exposureEligibleFees.map((item) => item.amount),
    totalScheduledRecurring,
    ...recurringFallbackAmounts,
  ]);

  return {
    result: {
      totalKnownExposure: calculatedCoreObligations,
      monthlyExposure: recurringCommitment.monthlyEquivalent,
      annualExposure: recurringCommitment.annualEquivalent,
      upfrontExposure,
      contingentExposure,
      maximumSinglePayment,
      unquantifiedContingentExposure,
      totalsByCurrency,
    },
    metadata: emptyMetadata(),
  };
}
