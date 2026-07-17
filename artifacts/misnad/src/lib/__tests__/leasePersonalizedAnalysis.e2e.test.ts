import assert from "node:assert/strict";
import type { FeeItem, FinancialMetrics, InformationalAmount, MoneyMetric, PaymentObligation, PenaltyItem, PercentageMetric } from "@workspace/financial-metrics";
import { buildFinancialConcepts, selectApplicableMonthlyOutflow, selectApplicableUpfrontLiquidity } from "../financialConcepts";
import { calculateBudgetImpact } from "../budgetImpact";

/**
 * End-to-end regression fixture for the confirmed residential lease
 * scenario (see the engine-level twin of this fixture,
 * `engine.leaseRentEquivalenceAndAutoFinanceRegression.test.ts`, in
 * `@workspace/financial-metrics`) — this test starts one layer higher, from
 * a `FinancialMetrics` object shaped exactly like that engine's real output,
 * and proves the frontend's concept-resolution + personalized-analysis
 * layers produce the exact figures the product requirement specifies.
 */

function knownMoney(value: number, currency = "SAR"): MoneyMetric {
  return { value, currency, status: "known", source: "test", reason: null, confidence: "high" };
}

function unavailableMoney(): MoneyMetric {
  return { value: null, currency: null, status: "unavailable", source: null, reason: "n/a", confidence: "low" };
}

function unavailablePercentage(): PercentageMetric {
  return { value: null, status: "unavailable", source: null, reason: "n/a", confidence: "low" };
}

function buildLeaseFinancialMetrics(): FinancialMetrics {
  const paymentObligations: PaymentObligation[] = [
    {
      id: "obligation-0",
      label: "Monthly rent",
      type: "recurring_payment",
      amount: knownMoney(3000),
      frequency: "monthly",
      numberOfPayments: 12,
      startDate: null,
      endDate: null,
      mandatory: true,
      conditional: null,
      refundable: null,
      financialRole: "recurring_outflow",
      sourceFields: ["typeDetails.monthlyRent"],
    },
    {
      id: "obligation-1",
      label: "Security deposit",
      type: "deposit",
      amount: knownMoney(2000),
      frequency: "one_time",
      numberOfPayments: null,
      startDate: null,
      endDate: null,
      mandatory: true,
      conditional: null,
      refundable: null,
      financialRole: "upfront_liquidity",
      sourceFields: ["typeDetails.securityDeposit"],
    },
  ];

  const fees: FeeItem[] = [
    {
      id: "fee-0",
      type: "other",
      label: "Brokerage fee",
      amount: knownMoney(1800),
      percentage: unavailablePercentage(),
      calculationBase: null,
      frequency: "one_time",
      mandatory: true,
      conditional: null,
      refundable: null,
      financialRole: "one_time_outflow",
      sourceFields: ["fees[0]"],
    },
    {
      id: "fee-1",
      type: "other",
      label: "Administrative fee",
      amount: knownMoney(250),
      percentage: unavailablePercentage(),
      calculationBase: null,
      frequency: "one_time",
      mandatory: true,
      conditional: null,
      refundable: null,
      financialRole: "one_time_outflow",
      sourceFields: ["fees[1]"],
    },
    {
      id: "fee-2",
      type: "maintenance",
      label: "Minor maintenance cost, up to 500 SAR per incident, when applicable",
      amount: knownMoney(500),
      percentage: unavailablePercentage(),
      calculationBase: null,
      frequency: "one_time",
      mandatory: true,
      conditional: true,
      refundable: null,
      financialRole: "conditional_cost",
      sourceFields: ["fees[2]"],
    },
  ];

  const penalties: PenaltyItem[] = [
    {
      id: "penalty-0",
      type: "late_payment",
      label: "Late payment fee",
      amount: knownMoney(150),
      percentage: unavailablePercentage(),
      calculationBase: null,
      trigger: "per late-payment incident",
      maximumAmount: unavailableMoney(),
      conditional: true,
      financialRole: "conditional_cost",
      sourceFields: ["penalties[0]"],
    },
    {
      id: "penalty-1",
      type: "late_payment",
      label: "Maximum total late fees during the contract",
      amount: knownMoney(450),
      percentage: unavailablePercentage(),
      calculationBase: null,
      trigger: "capped at 450 SAR for the whole contract term",
      maximumAmount: unavailableMoney(),
      conditional: true,
      financialRole: "conditional_cost",
      sourceFields: ["penalties[1]"],
    },
    {
      id: "penalty-2",
      type: "early_termination",
      label: "Early termination compensation",
      amount: knownMoney(6000),
      percentage: unavailablePercentage(),
      calculationBase: null,
      trigger: "if the tenant terminates the lease before the end of the term",
      maximumAmount: unavailableMoney(),
      conditional: true,
      financialRole: "conditional_cost",
      sourceFields: ["penalties[2]"],
    },
  ];

  const informationalAmounts: InformationalAmount[] = [
    {
      id: "informational-0",
      type: "annual_equivalent",
      label: "Annual rent",
      amount: knownMoney(36000),
      percentage: unavailablePercentage(),
      financialRole: "informational_total",
      sourceFields: ["financialObligations[0]"],
    },
    {
      id: "informational-1",
      type: "stated_due_at_signing",
      label: "Total due at signing",
      amount: knownMoney(7050),
      percentage: unavailablePercentage(),
      financialRole: "informational_total",
      sourceFields: ["financialObligations[1]"],
    },
  ];

  return {
    schemaVersion: "1.0",
    currency: "SAR",
    paymentObligations,
    informationalAmounts,
    recurringCommitment: {
      actualMonthlyAmount: knownMoney(3000),
      monthlyEquivalent: knownMoney(3000),
      annualEquivalent: knownMoney(36000),
      minimumMonthlyAmount: knownMoney(3000),
      maximumMonthlyAmount: knownMoney(3000),
      isVariable: null,
      includedObligationIds: ["obligation-0"],
    },
    contractDuration: {
      value: 12,
      unit: "months",
      months: 12,
      days: null,
      startDate: null,
      endDate: null,
      status: "known",
      source: "test",
      reason: null,
      confidence: "high",
    },
    totalCost: {
      statedTotalCost: unavailableMoney(),
      calculatedBaseCost: unavailableMoney(),
      calculatedCoreObligations: unavailableMoney(),
      calculatedKnownCost: unavailableMoney(),
      financingRepaymentTotal: unavailableMoney(),
      financingCost: unavailableMoney(),
      estimatedContractCost: unavailableMoney(),
      differenceFromStated: { classification: "unavailable", amount: unavailableMoney(), reason: "n/a" },
    },
    fees: {
      items: fees,
      totalKnownFees: unavailableMoney(),
      mandatoryFees: knownMoney(2050),
      upfrontFees: unavailableMoney(),
      recurringFees: unavailableMoney(),
      conditionalFees: unavailableMoney(),
      hasUndefinedFees: null,
      status: "known",
    },
    penalties: {
      items: penalties,
      totalKnownPenalties: unavailableMoney(),
      highestKnownPenalty: unavailableMoney(),
      hasUndefinedPenalty: null,
      status: "known",
    },
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

export function run(): void {
  const financialMetrics = buildLeaseFinancialMetrics();
  const concepts = buildFinancialConcepts(financialMetrics, "lease");

  // --- Concept-level assertions (requirement #18's personalized-analysis-facing half) ---
  const monthlyOutflow = selectApplicableMonthlyOutflow(concepts);
  assert.ok(monthlyOutflow);
  assert.equal(monthlyOutflow!.value, 3000, "monthly contract commitment = 3,000 (never doubled by the annual rent)");

  const upfrontLiquidity = selectApplicableUpfrontLiquidity(concepts, "lease");
  assert.ok(upfrontLiquidity);
  assert.equal(upfrontLiquidity!.value, 7050, "initial cash required = 7,050 (deposit + brokerage + admin + first month's rent)");
  console.log("PASS lease concepts: monthly commitment = 3,000, initial cash required = 7,050");

  // Both the monthly and annual rent are still individually visible.
  const monthlyRentConcept = concepts.find((c) => c.conceptId === "monthly_rent");
  const annualRentConcept = concepts.find((c) => c.conceptId === "annual_rent");
  assert.ok(monthlyRentConcept);
  assert.ok(annualRentConcept);
  assert.equal(monthlyRentConcept!.amount.value, 3000);
  assert.equal(annualRentConcept!.amount.value, 36000);
  assert.equal(annualRentConcept!.bucket, "informational", "the annual rent must never be counted as a second guaranteed obligation");
  console.log("PASS lease concepts: monthly rent (3,000) and annual rent (36,000) both display, only the monthly figure is guaranteed");

  // --- Personalized-analysis deterministic calculations, with the exact user inputs ---
  const result = calculateBudgetImpact(
    { monthlyIncome: 10000, essentialExpenses: 4000, existingMonthlyDebt: 1000, savings: 30000 },
    { monthlyCommitment: monthlyOutflow!.value, upfrontCosts: upfrontLiquidity!.value },
  );

  assert.equal(result.remainingMonthlyBeforeContract, 5000, "10,000 - 4,000 - 1,000 = 5,000");
  assert.equal(result.remainingMonthlyAfterContract, 2000, "5,000 - 3,000 = 2,000");
  assert.equal(result.newContractBurdenRatio, 30, "3,000 / 10,000 = 30%");
  assert.equal(result.totalMonthlyOutflowAfterContract, 8000, "4,000 + 1,000 + 3,000 = 8,000");
  assert.equal(result.totalOutflowRatioAfterContract, 80, "8,000 / 10,000 = 80%");
  assert.equal(result.savingsAfterInitialCash, 22950, "30,000 - 7,050 = 22,950");
  assert.equal(result.emergencyFundCoverageMonths, 2.9, "22,950 / 8,000 rounded to one decimal place");
  console.log(
    "PASS personalized analysis (exact user inputs): remaining before 5,000, remaining after 2,000, burden 30%, total outflow 8,000, outflow ratio 80%, savings after signing 22,950, emergency coverage ~2.9 months",
  );

  // --- Finite-number protection ---
  assert.equal(Number.isFinite(result.emergencyFundCoverageMonths!), true);
  assert.equal(Number.isFinite(result.totalOutflowRatioAfterContract!), true);
  assert.equal(Number.isFinite(result.newContractBurdenRatio!), true);
  console.log("PASS every personalized-analysis figure is a finite number — never NaN or Infinity");

  console.log("PASS leasePersonalizedAnalysis.e2e.test.ts");
}

run();
