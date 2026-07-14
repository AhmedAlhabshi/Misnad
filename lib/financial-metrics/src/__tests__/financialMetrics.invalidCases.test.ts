import assert from "node:assert/strict";
import { financialMetricsSchema } from "../financialMetrics";
import { paymentObligationSchema } from "../paymentObligation";
import type { MoneyMetric } from "../index";

function unavailableMoney(reason: string): MoneyMetric {
  return { value: null, currency: null, status: "unavailable", source: null, reason, confidence: "low" };
}

function knownMoney(value: number, currency: string, source = "contract text"): MoneyMetric {
  return { value, currency, status: "known", source, reason: null, confidence: "high" };
}

function baseObligation(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    label: "Monthly installment",
    type: "recurring_payment",
    amount: knownMoney(500, "SAR"),
    frequency: "monthly",
    numberOfPayments: 12,
    startDate: "2026-01-01",
    endDate: "2026-12-01",
    mandatory: true,
    conditional: false,
    sourceFields: ["clause_3"],
    ...overrides,
  };
}

function baseFinancialMetrics() {
  return {
    schemaVersion: "1.0" as const,
    currency: "SAR",
    paymentObligations: [] as unknown[],
    recurringCommitment: {
      actualMonthlyAmount: unavailableMoney("not stated"),
      monthlyEquivalent: unavailableMoney("not stated"),
      annualEquivalent: unavailableMoney("not stated"),
      minimumMonthlyAmount: unavailableMoney("not stated"),
      maximumMonthlyAmount: unavailableMoney("not stated"),
      isVariable: null,
      includedObligationIds: [] as string[],
    },
    contractDuration: {
      value: null,
      unit: null,
      months: null,
      days: null,
      startDate: null,
      endDate: null,
      status: "unavailable" as const,
      source: null,
      reason: "not stated",
      confidence: "low" as const,
    },
    totalCost: {
      statedTotalCost: unavailableMoney("not stated"),
      calculatedBaseCost: unavailableMoney("not stated"),
      calculatedCoreObligations: unavailableMoney("not stated"),
      calculatedKnownCost: unavailableMoney("not stated"),
      financingRepaymentTotal: unavailableMoney("not stated"),
      financingCost: unavailableMoney("not stated"),
      estimatedContractCost: unavailableMoney("not stated"),
      differenceFromStated: {
        classification: "unavailable" as const,
        amount: unavailableMoney("not stated"),
        reason: "not stated",
      },
    },
    fees: {
      items: [] as unknown[],
      totalKnownFees: unavailableMoney("not stated"),
      mandatoryFees: unavailableMoney("not stated"),
      upfrontFees: unavailableMoney("not stated"),
      recurringFees: unavailableMoney("not stated"),
      conditionalFees: unavailableMoney("not stated"),
      hasUndefinedFees: null,
      status: "unavailable" as const,
    },
    penalties: {
      items: [] as unknown[],
      totalKnownPenalties: unavailableMoney("not stated"),
      highestKnownPenalty: unavailableMoney("not stated"),
      hasUndefinedPenalty: null,
      status: "unavailable" as const,
    },
    ratios: {
      feesToBaseCost: { value: null, status: "unavailable" as const, source: null, reason: "not stated", confidence: "low" as const },
      penaltiesToBaseCost: { value: null, status: "unavailable" as const, source: null, reason: "not stated", confidence: "low" as const },
      upfrontPaymentToBaseCost: { value: null, status: "unavailable" as const, source: null, reason: "not stated", confidence: "low" as const },
      balloonPaymentToBaseCost: { value: null, status: "unavailable" as const, source: null, reason: "not stated", confidence: "low" as const },
      totalCostIncrease: { value: null, status: "unavailable" as const, source: null, reason: "not stated", confidence: "low" as const },
      recurringPaymentToIncome: { value: null, status: "unavailable" as const, source: null, reason: "not stated", confidence: "low" as const },
    },
    exposure: {
      totalKnownExposure: unavailableMoney("not stated"),
      monthlyExposure: unavailableMoney("not stated"),
      annualExposure: unavailableMoney("not stated"),
      upfrontExposure: unavailableMoney("not stated"),
      contingentExposure: unavailableMoney("not stated"),
      maximumSinglePayment: unavailableMoney("not stated"),
      unquantifiedContingentExposure: null,
      totalsByCurrency: [] as unknown[],
    },
    positiveFinancialFactors: [] as unknown[],
    calculationMetadata: {
      formulasUsed: [] as unknown[],
      unavailableCalculations: [] as string[],
      warnings: [] as unknown[],
      conflicts: [] as unknown[],
      excludedValues: [] as unknown[],
    },
  };
}

export function run(): void {
  // a. Negative number of payments.
  assert.equal(
    paymentObligationSchema.safeParse(baseObligation({ numberOfPayments: -1 })).success,
    false,
    "a negative numberOfPayments must be rejected",
  );

  // b. Fractional number of payments.
  assert.equal(
    paymentObligationSchema.safeParse(baseObligation({ numberOfPayments: 2.5 })).success,
    false,
    "a fractional numberOfPayments must be rejected",
  );

  // c. Duplicate item IDs among payment obligations must be rejected.
  const duplicateObligationIds = {
    ...baseFinancialMetrics(),
    paymentObligations: [baseObligation({ id: "dup" }), baseObligation({ id: "dup" })],
  };
  const duplicateObligationsResult = financialMetricsSchema.safeParse(duplicateObligationIds);
  assert.equal(
    duplicateObligationsResult.success,
    false,
    "duplicate payment obligation ids must be rejected",
  );

  // d. Duplicate item IDs among fee items must also be rejected.
  const feeItem = (id: string) => ({
    id,
    type: "other" as const,
    label: "Fee",
    amount: knownMoney(10, "SAR"),
    percentage: { value: null, status: "unavailable" as const, source: null, reason: "flat fee", confidence: "low" as const },
    calculationBase: null,
    frequency: "one_time" as const,
    mandatory: false,
    conditional: false,
    refundable: false,
    sourceFields: [] as string[],
  });
  const duplicateFeeIds = {
    ...baseFinancialMetrics(),
    fees: {
      ...baseFinancialMetrics().fees,
      items: [feeItem("dup"), feeItem("dup")],
      status: "known" as const,
    },
  };
  const duplicateFeesResult = financialMetricsSchema.safeParse(duplicateFeeIds);
  assert.equal(duplicateFeesResult.success, false, "duplicate fee item ids must be rejected");

  console.log("PASS financialMetrics.invalidCases.test.ts");
}

run();
