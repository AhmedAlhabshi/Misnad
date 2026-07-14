import assert from "node:assert/strict";
import { financialMetricsSchema } from "../financialMetrics";
import type { MoneyMetric, PercentageMetric } from "../index";

function unavailableMoney(reason: string): MoneyMetric {
  return { value: null, currency: null, status: "unavailable", source: null, reason, confidence: "low" };
}

function knownMoney(value: number, currency: string, source = "contract text"): MoneyMetric {
  return { value, currency, status: "known", source, reason: null, confidence: "high" };
}

function unavailablePercentage(reason: string): PercentageMetric {
  return { value: null, status: "unavailable", source: null, reason, confidence: "low" };
}

function knownPercentage(value: number, source = "contract text"): PercentageMetric {
  return { value, status: "known", source, reason: null, confidence: "medium" };
}

/** A fully valid "nothing is known yet" baseline — every metric unavailable, every collection empty. */
function baseFinancialMetrics() {
  return {
    schemaVersion: "1.0" as const,
    currency: null,
    paymentObligations: [],
    recurringCommitment: {
      actualMonthlyAmount: unavailableMoney("not stated in contract"),
      monthlyEquivalent: unavailableMoney("not stated in contract"),
      annualEquivalent: unavailableMoney("not stated in contract"),
      minimumMonthlyAmount: unavailableMoney("not stated in contract"),
      maximumMonthlyAmount: unavailableMoney("not stated in contract"),
      isVariable: null,
      includedObligationIds: [],
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
      reason: "duration not stated in contract",
      confidence: "low" as const,
    },
    totalCost: {
      statedTotalCost: unavailableMoney("not stated in contract"),
      calculatedBaseCost: unavailableMoney("insufficient data to calculate"),
      calculatedCoreObligations: unavailableMoney("insufficient data to calculate"),
      calculatedKnownCost: unavailableMoney("insufficient data to calculate"),
      financingRepaymentTotal: unavailableMoney("insufficient data to calculate"),
      financingCost: unavailableMoney("insufficient data to calculate"),
      estimatedContractCost: unavailableMoney("insufficient data to calculate"),
      differenceFromStated: {
        classification: "unavailable" as const,
        amount: unavailableMoney("insufficient data to calculate"),
        reason: "no stated total to compare against",
      },
    },
    fees: {
      items: [],
      totalKnownFees: unavailableMoney("no fees found"),
      mandatoryFees: unavailableMoney("no fees found"),
      upfrontFees: unavailableMoney("no fees found"),
      recurringFees: unavailableMoney("no fees found"),
      conditionalFees: unavailableMoney("no fees found"),
      hasUndefinedFees: null,
      status: "unavailable" as const,
    },
    penalties: {
      items: [],
      totalKnownPenalties: unavailableMoney("no penalties found"),
      highestKnownPenalty: unavailableMoney("no penalties found"),
      hasUndefinedPenalty: null,
      status: "unavailable" as const,
    },
    ratios: {
      feesToBaseCost: unavailablePercentage("insufficient data"),
      penaltiesToBaseCost: unavailablePercentage("insufficient data"),
      upfrontPaymentToBaseCost: unavailablePercentage("insufficient data"),
      balloonPaymentToBaseCost: unavailablePercentage("insufficient data"),
      totalCostIncrease: unavailablePercentage("insufficient data"),
      recurringPaymentToIncome: unavailablePercentage("insufficient data"),
    },
    exposure: {
      totalKnownExposure: unavailableMoney("insufficient data"),
      monthlyExposure: unavailableMoney("insufficient data"),
      annualExposure: unavailableMoney("insufficient data"),
      upfrontExposure: unavailableMoney("insufficient data"),
      contingentExposure: unavailableMoney("insufficient data"),
      maximumSinglePayment: unavailableMoney("insufficient data"),
      unquantifiedContingentExposure: null,
      totalsByCurrency: [],
    },
    positiveFinancialFactors: [],
    calculationMetadata: {
      formulasUsed: [],
      unavailableCalculations: [],
      warnings: [],
      conflicts: [],
      excludedValues: [],
    },
  };
}

export function run(): void {
  // a. No available financial information: the fully "unavailable" baseline itself must be valid.
  const noInfo = baseFinancialMetrics();
  const noInfoResult = financialMetricsSchema.safeParse(noInfo);
  assert.equal(
    noInfoResult.success,
    true,
    `a contract with no available financial information must still validate: ${!noInfoResult.success ? noInfoResult.error.message : ""}`,
  );

  // b. Monthly payment with a known duration.
  const monthlyPayment = {
    ...baseFinancialMetrics(),
    currency: "SAR",
    paymentObligations: [
      {
        id: "p1",
        label: "Monthly installment",
        type: "recurring_payment" as const,
        amount: knownMoney(500, "SAR"),
        frequency: "monthly" as const,
        numberOfPayments: 12,
        startDate: "2026-01-01",
        endDate: "2026-12-01",
        mandatory: true,
        conditional: false,
        sourceFields: ["clause_3"],
      },
    ],
    recurringCommitment: {
      ...baseFinancialMetrics().recurringCommitment,
      actualMonthlyAmount: knownMoney(500, "SAR"),
      monthlyEquivalent: knownMoney(500, "SAR"),
      annualEquivalent: knownMoney(6000, "SAR"),
      isVariable: false,
    },
    contractDuration: {
      value: 12,
      unit: "months" as const,
      months: 12,
      days: null,
      startDate: "2026-01-01",
      endDate: "2026-12-01",
      status: "known" as const,
      source: "clause_1",
      reason: null,
      confidence: "high" as const,
    },
  };
  const monthlyPaymentResult = financialMetricsSchema.safeParse(monthlyPayment);
  assert.equal(
    monthlyPaymentResult.success,
    true,
    `a monthly payment with a known duration must be accepted: ${!monthlyPaymentResult.success ? monthlyPaymentResult.error.message : ""}`,
  );

  // c. Multiple currencies, represented separately.
  const multipleCurrencies = {
    ...baseFinancialMetrics(),
    exposure: {
      ...baseFinancialMetrics().exposure,
      totalsByCurrency: [knownMoney(10000, "SAR"), knownMoney(500, "USD")],
    },
  };
  const multipleCurrenciesResult = financialMetricsSchema.safeParse(multipleCurrencies);
  assert.equal(
    multipleCurrenciesResult.success,
    true,
    `multiple currencies represented as separate entries must be accepted: ${!multipleCurrenciesResult.success ? multipleCurrenciesResult.error.message : ""}`,
  );

  // d. Variable amount range (a recurring commitment with distinct min/max monthly amounts).
  const variableRange = {
    ...baseFinancialMetrics(),
    currency: "SAR",
    recurringCommitment: {
      ...baseFinancialMetrics().recurringCommitment,
      isVariable: true,
      minimumMonthlyAmount: knownMoney(300, "SAR"),
      maximumMonthlyAmount: knownMoney(700, "SAR"),
    },
  };
  const variableRangeResult = financialMetricsSchema.safeParse(variableRange);
  assert.equal(
    variableRangeResult.success,
    true,
    `a variable amount range must be accepted: ${!variableRangeResult.success ? variableRangeResult.error.message : ""}`,
  );

  // e. Conditional fees and penalties.
  const conditionalFeesAndPenalties = {
    ...baseFinancialMetrics(),
    currency: "SAR",
    fees: {
      ...baseFinancialMetrics().fees,
      items: [
        {
          id: "f1",
          type: "other" as const,
          label: "Late setup fee",
          amount: knownMoney(50, "SAR"),
          percentage: unavailablePercentage("flat fee, no percentage basis"),
          calculationBase: null,
          frequency: "one_time" as const,
          mandatory: false,
          conditional: true,
          refundable: false,
          sourceFields: ["clause_5"],
        },
      ],
      totalKnownFees: knownMoney(50, "SAR"),
      status: "known" as const,
    },
    penalties: {
      ...baseFinancialMetrics().penalties,
      items: [
        {
          id: "pen1",
          type: "late_payment" as const,
          label: "Late payment penalty",
          amount: unavailableMoney("percentage-based, no flat amount stated"),
          percentage: knownPercentage(5),
          calculationBase: "outstanding balance",
          trigger: "payment more than 10 days late",
          maximumAmount: unavailableMoney("no cap stated"),
          conditional: true,
          sourceFields: ["clause_7"],
        },
      ],
      totalKnownPenalties: unavailableMoney("percentage-based only, cannot total without a balance"),
      status: "known" as const,
    },
  };
  const conditionalResult = financialMetricsSchema.safeParse(conditionalFeesAndPenalties);
  assert.equal(
    conditionalResult.success,
    true,
    `conditional fees and penalties must be accepted: ${!conditionalResult.success ? conditionalResult.error.message : ""}`,
  );

  // f. Refundable deposit.
  const refundableDeposit = {
    ...baseFinancialMetrics(),
    currency: "SAR",
    fees: {
      ...baseFinancialMetrics().fees,
      items: [
        {
          id: "dep1",
          type: "other" as const,
          label: "Security Deposit",
          amount: knownMoney(1000, "SAR"),
          percentage: unavailablePercentage("flat fee"),
          calculationBase: null,
          frequency: "one_time" as const,
          mandatory: true,
          conditional: false,
          refundable: true,
          sourceFields: ["clause_9"],
        },
      ],
      totalKnownFees: knownMoney(1000, "SAR"),
      status: "known" as const,
    },
  };
  const refundableDepositResult = financialMetricsSchema.safeParse(refundableDeposit);
  assert.equal(
    refundableDepositResult.success,
    true,
    `a refundable deposit must be accepted: ${!refundableDepositResult.success ? refundableDepositResult.error.message : ""}`,
  );

  // g. Stated and calculated total cost.
  const statedAndCalculatedTotalCost = {
    ...baseFinancialMetrics(),
    currency: "SAR",
    totalCost: {
      statedTotalCost: knownMoney(12000, "SAR"),
      calculatedBaseCost: knownMoney(11800, "SAR"),
      calculatedCoreObligations: knownMoney(11800, "SAR"),
      calculatedKnownCost: knownMoney(11950, "SAR"),
      financingRepaymentTotal: unavailableMoney("no financed principal was found"),
      financingCost: unavailableMoney("no financed principal was found"),
      estimatedContractCost: knownMoney(12000, "SAR"),
      differenceFromStated: {
        classification: "rounding" as const,
        amount: knownMoney(50, "SAR"),
        reason: "small rounding difference between the stated and calculated totals",
      },
    },
  };
  const totalCostResult = financialMetricsSchema.safeParse(statedAndCalculatedTotalCost);
  assert.equal(
    totalCostResult.success,
    true,
    `a stated total cost alongside a calculated total cost must be accepted: ${!totalCostResult.success ? totalCostResult.error.message : ""}`,
  );

  console.log("PASS financialMetrics.validCases.test.ts");
}

run();
