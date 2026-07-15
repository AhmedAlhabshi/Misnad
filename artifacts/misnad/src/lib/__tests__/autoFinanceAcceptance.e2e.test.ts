import assert from "node:assert/strict";
import { calculateFinancialMetrics, type FinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult } from "@/types/analysis";
import { buildFinancialConcepts, selectApplicableMonthlyOutflow, selectApplicableUpfrontLiquidity } from "../financialConcepts";
import { calculateBudgetImpact } from "../budgetImpact";

/**
 * Full end-to-end reproduction of the task's own acceptance case, run
 * through the real deterministic engine (not a hand-built FinancialMetrics
 * fixture): the same real Arabic auto-finance figures — vehicle cash price
 * 120,000, down payment 9,600, financed amount 96,000, administrative fee
 * 1,200 (a mandatory fee explicitly due at signing, per the contract's own
 * wording), monthly installment 2,400 x 48, final/balloon payment 19,200 —
 * and the same budget inputs (income 12,000 / essential expenses 5,000 /
 * existing debt 2,000 / savings 20,000) must produce exactly: before 5,000,
 * after 2,600, contract-income-ratio 20%, total-commitment-ratio ~36.7%,
 * savings-after-upfront 9,200. Any discrepancy here must be reported, never
 * silently patched by adjusting these expected numbers.
 */
function buildAcceptanceAnalysis(): ContractAnalysisResult {
  return {
    contractType: "auto_finance",
    contractSummary: "A vehicle financing agreement between the buyer and the finance company.",
    contractSummarySimple: "You are financing a car and paying it back monthly.",
    parties: [],
    financialObligations: [],
    dates: [],
    penalties: [],
    fees: [
      { description: "Mandatory administrative fee: 1,200 SAR, payable upon signing the contract.", amount: 1200, currency: "SAR", isRecurring: false },
    ],
    importantClauses: [],
    extractedNumbers: [],
    missingInformation: [],
    extractionNotes: null,
    typeDetails: {
      contractType: "auto_finance",
      vehicleMake: null,
      vehicleModel: null,
      vehicleYear: null,
      financedAmount: 96000,
      downPayment: 9600,
      interestRate: 8.75,
      loanTermMonths: 48,
      monthlyInstallment: 2400,
      balloonPayment: 19200,
    },
  };
}

export function run(): void {
  const analysis = buildAcceptanceAnalysis();
  const financialMetrics: FinancialMetrics = calculateFinancialMetrics(analysis as unknown as Parameters<typeof calculateFinancialMetrics>[0]);

  assert.equal(financialMetrics.totalCost.calculatedKnownCost.value, 145200, "known cost must be 145,200 SAR (145,200 = 9,600 + 115,200 + 19,200 + 1,200)");

  const concepts = buildFinancialConcepts(financialMetrics, analysis.contractType);
  const monthlyOutflow = selectApplicableMonthlyOutflow(concepts);
  const upfrontLiquidity = selectApplicableUpfrontLiquidity(concepts);

  assert.equal(monthlyOutflow?.value, 2400, "applicable monthly outflow must be the 2,400 SAR monthly installment");
  assert.equal(upfrontLiquidity?.value, 10800, "applicable upfront liquidity must be 9,600 (down payment) + 1,200 (admin fee) = 10,800");

  const result = calculateBudgetImpact(
    { monthlyIncome: 12000, essentialExpenses: 5000, existingMonthlyDebt: 2000, savings: 20000 },
    { monthlyCommitment: monthlyOutflow.value, upfrontCosts: upfrontLiquidity.value },
  );

  assert.equal(result.availableBeforeContract, 5000, "available before contract must be 5,000 SAR");
  assert.equal(result.availableAfterContract, 2600, "available after contract must be 2,600 SAR");
  assert.equal(result.contractIncomeRatio, 20, "contract-income-ratio must be 20%");
  assert.ok(
    result.totalCommitmentRatio !== null && Math.abs(result.totalCommitmentRatio - 36.666666666666664) < 0.001,
    `total-commitment-ratio must be ~36.7% (got ${result.totalCommitmentRatio})`,
  );
  assert.equal(result.remainingSavings, 9200, "savings after upfront must be 9,200 SAR");

  // This task's own regression expectation: with 30,000 SAR in savings instead of 20,000, the same
  // upfront liquidity (9,600 down payment + 1,200 mandatory signing fee = 10,800) must leave exactly
  // 19,200 SAR remaining — confirming the signing fee is no longer silently excluded.
  const resultWithHigherSavings = calculateBudgetImpact(
    { monthlyIncome: 12000, essentialExpenses: 5000, existingMonthlyDebt: 2000, savings: 30000 },
    { monthlyCommitment: monthlyOutflow.value, upfrontCosts: upfrontLiquidity.value },
  );
  assert.equal(
    resultWithHigherSavings.remainingSavings,
    19200,
    "30,000 savings - 9,600 down payment - 1,200 mandatory signing fee = 19,200 remaining savings",
  );

  console.log("PASS autoFinanceAcceptance.e2e.test.ts");
}

run();
