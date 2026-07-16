import assert from "node:assert/strict";
import type { FinancialMetrics, MoneyMetric, PercentageMetric } from "@workspace/financial-metrics";
import { collectFinancialFacts } from "../financialCollector";

function knownMoney(value: number, currency = "SAR"): MoneyMetric {
  return { value, currency, status: "known", source: "test", reason: null, confidence: "high" };
}
function unavailableMoney(): MoneyMetric {
  return { value: null, currency: null, status: "unavailable", source: null, reason: "not stated", confidence: "low" };
}
function knownPercentage(value: number): PercentageMetric {
  return { value, status: "known", source: "test", reason: null, confidence: "high" };
}
function unavailablePercentage(): PercentageMetric {
  return { value: null, status: "unavailable", source: null, reason: "not stated", confidence: "low" };
}

function baseFixture(): FinancialMetrics {
  return {
    schemaVersion: "1.0",
    currency: "SAR",
    paymentObligations: [],
    informationalAmounts: [],
    recurringCommitment: {
      actualMonthlyAmount: unavailableMoney(),
      monthlyEquivalent: unavailableMoney(),
      annualEquivalent: unavailableMoney(),
      minimumMonthlyAmount: unavailableMoney(),
      maximumMonthlyAmount: unavailableMoney(),
      isVariable: null,
      includedObligationIds: [],
    },
    contractDuration: { value: null, unit: null, months: null, days: null, startDate: null, endDate: null, status: "unavailable", source: null, reason: "not stated", confidence: "low" },
    totalCost: {
      statedTotalCost: unavailableMoney(),
      calculatedBaseCost: unavailableMoney(),
      calculatedCoreObligations: unavailableMoney(),
      calculatedKnownCost: unavailableMoney(),
      financingRepaymentTotal: unavailableMoney(),
      financingCost: unavailableMoney(),
      estimatedContractCost: unavailableMoney(),
      differenceFromStated: { classification: "unavailable", amount: unavailableMoney(), reason: null },
    },
    fees: { items: [], totalKnownFees: unavailableMoney(), mandatoryFees: unavailableMoney(), upfrontFees: unavailableMoney(), recurringFees: unavailableMoney(), conditionalFees: unavailableMoney(), hasUndefinedFees: null, status: "unavailable" },
    penalties: { items: [], totalKnownPenalties: unavailableMoney(), highestKnownPenalty: unavailableMoney(), hasUndefinedPenalty: null, status: "unavailable" },
    ratios: {
      feesToBaseCost: unavailablePercentage(),
      penaltiesToBaseCost: unavailablePercentage(),
      upfrontPaymentToBaseCost: unavailablePercentage(),
      balloonPaymentToBaseCost: unavailablePercentage(),
      totalCostIncrease: unavailablePercentage(),
      recurringPaymentToIncome: unavailablePercentage(),
    },
    exposure: {
      totalKnownExposure: unavailableMoney(),
      monthlyExposure: unavailableMoney(),
      annualExposure: unavailableMoney(),
      upfrontExposure: unavailableMoney(),
      contingentExposure: unavailableMoney(),
      maximumSinglePayment: unavailableMoney(),
      unquantifiedContingentExposure: null,
      totalsByCurrency: [],
    },
    positiveFinancialFactors: [],
    calculationMetadata: { formulasUsed: [], unavailableCalculations: [], warnings: [], conflicts: [], excludedValues: [] },
  };
}

export async function run(): Promise<void> {
  // --- No metrics object at all: empty, no throw ---
  {
    const facts = collectFinancialFacts(null);
    assert.deepEqual(facts, []);
  }
  console.log("PASS collectFinancialFacts returns an empty array when no FinancialMetrics is provided");

  // --- Every value unavailable: no facts fabricated ---
  {
    const facts = collectFinancialFacts(baseFixture());
    assert.deepEqual(facts, [], "an all-unavailable FinancialMetrics must produce zero facts, never placeholders");
  }
  console.log("PASS collectFinancialFacts never fabricates a fact from an unavailable metric");

  // --- Monthly payment, total cost, a fee, and a penalty all surface as distinct known facts ---
  {
    const fixture = baseFixture();
    fixture.recurringCommitment.actualMonthlyAmount = knownMoney(2400);
    fixture.totalCost.calculatedKnownCost = knownMoney(134400);
    fixture.fees.items = [
      { id: "fee-1", type: "administration", label: "Administration fee", amount: knownMoney(1200), percentage: unavailablePercentage(), calculationBase: null, frequency: "one_time", mandatory: true, conditional: false, refundable: false, financialRole: "one_time_outflow", sourceFields: [] },
    ];
    fixture.penalties.items = [
      { id: "pen-1", type: "late_payment", label: "Late payment penalty", amount: knownMoney(50), percentage: unavailablePercentage(), calculationBase: null, trigger: "payment overdue by 10 days", maximumAmount: unavailableMoney(), conditional: true, financialRole: "conditional_cost", sourceFields: [] },
    ];

    const facts = collectFinancialFacts(fixture);
    const factKeys = facts.map((f) => f.factKey);
    assert.ok(factKeys.includes("monthly_payment"));
    assert.ok(factKeys.includes("total_cost"));
    assert.ok(factKeys.includes("fee:fee-1"));
    assert.ok(factKeys.includes("penalty:pen-1"));

    const monthlyFact = facts.find((f) => f.factKey === "monthly_payment")!;
    assert.equal(monthlyFact.source, "financial");
    assert.equal(monthlyFact.authority, "financial_metrics_engine");
    assert.ok(monthlyFact.excerpt.includes("2,400.00"));
    assert.ok(monthlyFact.excerpt.includes("SAR"));
    assert.equal(monthlyFact.citation, "financialMetrics.recurringCommitment");

    const feeFact = facts.find((f) => f.factKey === "fee:fee-1")!;
    assert.ok(feeFact.excerpt.includes("Administration fee"));
    assert.ok(feeFact.excerpt.includes("1,200.00"));
  }
  console.log("PASS collectFinancialFacts surfaces monthly payment, total cost, fees, and penalties as distinct facts");

  console.log("PASS financialCollector.test.ts");
}

run();
