import type { FinancialRatios } from "../ratios";
import type { FormulaRecord } from "../calculationMetadata";
import type { MoneyMetric } from "../moneyMetric";
import type { PercentageMetric } from "../percentageMetric";
import { safeDivide } from "../utils/guards";
import { knownPercentage, unavailablePercentage } from "../utils/metricFactories";
import { round2 } from "../utils/rounding";
import { emptyMetadata, type CalculatorMetadata } from "./metadata";

interface RatioComputation {
  metric: PercentageMetric;
  formula: FormulaRecord | null;
}

/**
 * A ratio is only ever computed when both values are known, in the same
 * currency, the denominator is non-zero, and the result is finite —
 * otherwise it is reported unavailable with the specific reason, never
 * guessed or left as `0`.
 */
function computeRatio(
  numerator: MoneyMetric,
  denominator: MoneyMetric,
  metricName: string,
  formulaText: string,
): RatioComputation {
  if (numerator.value === null || denominator.value === null) {
    return { metric: unavailablePercentage("a required value is missing"), formula: null };
  }
  if (numerator.currency === null || denominator.currency === null || numerator.currency !== denominator.currency) {
    return { metric: unavailablePercentage("the numerator and denominator use different or unknown currencies"), formula: null };
  }
  if (denominator.value === 0) {
    return { metric: unavailablePercentage("the denominator is zero"), formula: null };
  }

  const ratio = safeDivide(numerator.value, denominator.value);
  if (ratio === null) {
    return { metric: unavailablePercentage("the result is not a finite number"), formula: null };
  }

  const percentage = ratio * 100;
  return {
    metric: knownPercentage(percentage, formulaText),
    formula: {
      metric: metricName,
      formula: formulaText,
      inputs: { numerator: numerator.value, denominator: denominator.value },
      result: round2(percentage),
      status: "known",
    },
  };
}

function collect(name: string, computation: RatioComputation, metadata: CalculatorMetadata): PercentageMetric {
  if (computation.formula) {
    metadata.formulas.push(computation.formula);
  }
  if (computation.metric.status !== "known") {
    metadata.unavailable.push(name);
  }
  return computation.metric;
}

/**
 * `feesToBaseCost`, `penaltiesToBaseCost`, `upfrontPaymentToBaseCost`,
 * `balloonPaymentToBaseCost`, `totalCostIncrease` (the spec's "finance-cost
 * ratio": `financingCost ÷ financedPrincipal`, where `financingCost` is
 * `financingRepaymentTotal - principal` — see `calculators/costs.ts` for the
 * full financial-scope model; this ratio deliberately never uses
 * `calculatedKnownCost`/`calculatedCoreObligations`, since those mix in
 * pre-financing amounts like a down payment), and `recurringPaymentToIncome`
 * are the only ratios Milestone 5.5's schema defines — see the engine's
 * final report for two ratios described in the Milestone 5.6 prompt
 * (total-outflow-to-principal, credit utilization) that have no
 * corresponding schema field.
 */
export function calculateRatios(
  principal: MoneyMetric,
  mandatoryFees: MoneyMetric,
  totalKnownPenalties: MoneyMetric,
  upfrontExposure: MoneyMetric,
  balloonPaymentAmount: MoneyMetric,
  financingCost: MoneyMetric,
  monthlyCommitment: MoneyMetric,
  monthlyIncome: MoneyMetric,
): { result: FinancialRatios; metadata: CalculatorMetadata } {
  const metadata = emptyMetadata();

  const feesToBaseCost = collect(
    "ratios.feesToBaseCost",
    computeRatio(mandatoryFees, principal, "ratios.feesToBaseCost", "mandatoryFees ÷ principal × 100"),
    metadata,
  );
  const penaltiesToBaseCost = collect(
    "ratios.penaltiesToBaseCost",
    computeRatio(totalKnownPenalties, principal, "ratios.penaltiesToBaseCost", "totalKnownPenalties ÷ principal × 100"),
    metadata,
  );
  const upfrontPaymentToBaseCost = collect(
    "ratios.upfrontPaymentToBaseCost",
    computeRatio(upfrontExposure, principal, "ratios.upfrontPaymentToBaseCost", "upfrontExposure ÷ principal × 100"),
    metadata,
  );
  const balloonPaymentToBaseCost = collect(
    "ratios.balloonPaymentToBaseCost",
    computeRatio(balloonPaymentAmount, principal, "ratios.balloonPaymentToBaseCost", "balloonPayment ÷ principal × 100"),
    metadata,
  );

  // Finance-cost ratio: financingCost ÷ principal × 100. `financingCost` is
  // precomputed by `costs.ts` (`financingRepaymentTotal - principal`, scoped
  // to exclude pre-financing amounts) and already reports `unavailable` when
  // repayment is incomplete/below principal — this reuses the same generic
  // `computeRatio` safety checks (both known, same currency, non-zero
  // denominator) as every other ratio here, rather than a bespoke check.
  const totalCostIncrease = collect(
    "ratios.totalCostIncrease",
    computeRatio(financingCost, principal, "ratios.totalCostIncrease", "financingCost ÷ principal × 100"),
    metadata,
  );

  const recurringPaymentToIncome = collect(
    "ratios.recurringPaymentToIncome",
    computeRatio(monthlyCommitment, monthlyIncome, "ratios.recurringPaymentToIncome", "monthlyCommitment ÷ monthlyIncome × 100"),
    metadata,
  );

  return {
    result: {
      feesToBaseCost,
      penaltiesToBaseCost,
      upfrontPaymentToBaseCost,
      balloonPaymentToBaseCost,
      totalCostIncrease,
      recurringPaymentToIncome,
    },
    metadata,
  };
}
