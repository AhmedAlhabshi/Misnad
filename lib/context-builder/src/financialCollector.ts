import type { FinancialMetrics, MoneyMetric, PercentageMetric } from "@workspace/financial-metrics";
import type { FinancialFactItem } from "./schema";

/** Deterministic engine output, not a licensed or regulatory authority — kept distinct from "user_contract" and real legal authorities like "sama". */
export const FINANCIAL_FACT_AUTHORITY = "financial_metrics_engine";

/**
 * Fixed, documented relevance priority per fact category. These are NOT
 * text-matched against the question (that would require interpreting the
 * question's meaning, which this layer never does) — every already-known
 * financial fact is always equally "true" for the current contract, so
 * relevance here instead reflects how commonly a given fact category
 * answers a financial question at all, mirroring the priority order the
 * existing frontend's own snapshot-metric selector already uses.
 */
const FACT_RELEVANCE = {
  monthlyPayment: 1.0,
  totalCost: 0.95,
  annualCommitment: 0.9,
  contractDuration: 0.85,
  fee: 0.8,
  penalty: 0.8,
  feeTotal: 0.75,
  penaltyTotal: 0.75,
  financingCost: 0.72,
  exposure: 0.7,
  ratio: 0.6,
} as const;

/** Never returns null for a genuinely known/estimated value and never fabricates one for an unavailable metric — this is a pure formatting function over an already-computed number. */
function formatMoney(metric: MoneyMetric): string | null {
  if (metric.status === "unavailable" || metric.value === null) return null;
  const amount = metric.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const currency = metric.currency ?? "";
  const qualifier = metric.status === "estimated" ? " (estimated)" : "";
  return `${amount} ${currency}${qualifier}`.trim();
}

function formatPercentage(metric: PercentageMetric): string | null {
  if (metric.status === "unavailable" || metric.value === null) return null;
  const qualifier = metric.status === "estimated" ? " (estimated)" : "";
  return `${metric.value}%${qualifier}`;
}

function fact(factKey: string, label: string, excerpt: string, relevanceScore: number, citationSuffix: string): FinancialFactItem {
  return {
    source: "financial",
    authority: FINANCIAL_FACT_AUTHORITY,
    citation: `financialMetrics.${citationSuffix}`,
    relevanceScore,
    excerpt,
    factKey,
    label,
  };
}

/**
 * Deterministically projects `FinancialMetrics` (already computed
 * elsewhere, before this milestone) into one evidence item per known
 * value — never an aggregate sentence describing several numbers at once,
 * never a value this function computes itself. A metric whose `status` is
 * "unavailable" is skipped entirely, never rendered as 0 or omitted
 * silently from a total that implies otherwise.
 */
export function collectFinancialFacts(metrics: FinancialMetrics | null): FinancialFactItem[] {
  if (!metrics) return [];
  const facts: FinancialFactItem[] = [];

  const monthly = formatMoney(metrics.recurringCommitment.actualMonthlyAmount) ?? formatMoney(metrics.recurringCommitment.monthlyEquivalent);
  if (monthly) {
    facts.push(fact("monthly_payment", "Monthly payment", `Monthly payment: ${monthly}`, FACT_RELEVANCE.monthlyPayment, "recurringCommitment"));
  }

  const annual = formatMoney(metrics.recurringCommitment.annualEquivalent);
  if (annual) {
    facts.push(fact("annual_commitment", "Annual commitment", `Annual commitment: ${annual}`, FACT_RELEVANCE.annualCommitment, "recurringCommitment.annualEquivalent"));
  }

  const duration = metrics.contractDuration;
  if (duration.status !== "unavailable" && (duration.months !== null || duration.value !== null)) {
    const value = duration.months ?? duration.value;
    const unitLabel = duration.months !== null ? "months" : (duration.unit ?? "");
    facts.push(fact("contract_duration", "Contract duration", `Contract duration: ${value} ${unitLabel}`.trim(), FACT_RELEVANCE.contractDuration, "contractDuration"));
  }

  const totalCost = formatMoney(metrics.totalCost.calculatedKnownCost) ?? formatMoney(metrics.totalCost.statedTotalCost);
  if (totalCost) {
    facts.push(fact("total_cost", "Total known cost", `Total known cost: ${totalCost}`, FACT_RELEVANCE.totalCost, "totalCost.calculatedKnownCost"));
  }

  const financingCost = formatMoney(metrics.totalCost.financingCost);
  if (financingCost) {
    facts.push(fact("financing_cost", "Financing cost", `Financing cost: ${financingCost}`, FACT_RELEVANCE.financingCost, "totalCost.financingCost"));
  }

  for (const feeItem of metrics.fees.items) {
    const amount = formatMoney(feeItem.amount);
    if (!amount) continue;
    const frequencySuffix = feeItem.frequency && feeItem.frequency !== "unknown" ? ` (${feeItem.frequency})` : "";
    facts.push(fact(`fee:${feeItem.id}`, `Fee: ${feeItem.label}`, `Fee: ${feeItem.label} — ${amount}${frequencySuffix}`, FACT_RELEVANCE.fee, `fees.items[${feeItem.id}]`));
  }
  const totalFees = formatMoney(metrics.fees.totalKnownFees);
  if (totalFees) {
    facts.push(fact("total_known_fees", "Total known fees", `Total known fees: ${totalFees}`, FACT_RELEVANCE.feeTotal, "fees.totalKnownFees"));
  }

  for (const penaltyItem of metrics.penalties.items) {
    const amount = formatMoney(penaltyItem.amount);
    const percentage = formatPercentage(penaltyItem.percentage);
    const value = amount ?? percentage;
    if (!value) continue;
    const triggerSuffix = penaltyItem.trigger ? ` (trigger: ${penaltyItem.trigger})` : "";
    facts.push(fact(`penalty:${penaltyItem.id}`, `Penalty: ${penaltyItem.label}`, `Penalty: ${penaltyItem.label} — ${value}${triggerSuffix}`, FACT_RELEVANCE.penalty, `penalties.items[${penaltyItem.id}]`));
  }
  const totalPenalties = formatMoney(metrics.penalties.totalKnownPenalties);
  if (totalPenalties) {
    facts.push(fact("total_known_penalties", "Total known penalties", `Total known penalties: ${totalPenalties}`, FACT_RELEVANCE.penaltyTotal, "penalties.totalKnownPenalties"));
  }

  const upfrontExposure = formatMoney(metrics.exposure.upfrontExposure);
  if (upfrontExposure) {
    facts.push(fact("upfront_exposure", "Upfront exposure", `Upfront exposure: ${upfrontExposure}`, FACT_RELEVANCE.exposure, "exposure.upfrontExposure"));
  }
  const totalExposure = formatMoney(metrics.exposure.totalKnownExposure);
  if (totalExposure) {
    facts.push(fact("total_exposure", "Total known exposure", `Total known exposure: ${totalExposure}`, FACT_RELEVANCE.exposure, "exposure.totalKnownExposure"));
  }

  const feesToBaseCost = formatPercentage(metrics.ratios.feesToBaseCost);
  if (feesToBaseCost) {
    facts.push(fact("fees_to_base_cost_ratio", "Fees-to-base-cost ratio", `Fees-to-base-cost ratio: ${feesToBaseCost}`, FACT_RELEVANCE.ratio, "ratios.feesToBaseCost"));
  }
  const penaltiesToBaseCost = formatPercentage(metrics.ratios.penaltiesToBaseCost);
  if (penaltiesToBaseCost) {
    facts.push(fact("penalties_to_base_cost_ratio", "Penalties-to-base-cost ratio", `Penalties-to-base-cost ratio: ${penaltiesToBaseCost}`, FACT_RELEVANCE.ratio, "ratios.penaltiesToBaseCost"));
  }

  return facts;
}
