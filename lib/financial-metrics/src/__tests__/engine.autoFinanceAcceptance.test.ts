import assert from "node:assert/strict";
import { calculateFinancialMetrics } from "../engine";
import { financialMetricsSchema } from "../financialMetrics";
import { autoFinanceDetails, baseContractUnderstanding, fee } from "./fixtures/contractUnderstanding";

/**
 * The manually-tested real Arabic auto-finance acceptance fixture (see the
 * "144,000 vs 145,200 SAR" investigation): a plainly-worded administrative
 * fee ("Administrative fee: 1,200 SAR" — no "mandatory"/"is paid" verb) was
 * silently excluded from every cost total because `inferMandatoryFromText`
 * defaulted an unstated fee to `null` instead of `true`. This fixture
 * deliberately uses that same plain wording (not the "is paid after contract
 * execution" special-cased phrasing used by the older SAMA fixture) to prove
 * the generic engine-level fix, not a one-off patch for this one document.
 *
 * These acceptance numbers come from the task's own spec, not invented here:
 * vehicle cash price 120,000, down payment 9,600, financed amount 96,000,
 * administrative fee 1,200, monthly installment 2,400 x 48 = 115,200, final
 * (balloon) payment 19,200, total repayment 134,400, financing cost 38,400,
 * upfront liquidity requirement 10,800.
 */
function buildAcceptanceFixture() {
  const input = baseContractUnderstanding(
    autoFinanceDetails({
      financedAmount: 96000,
      downPayment: 9600,
      interestRate: 8.75,
      loanTermMonths: 48,
      monthlyInstallment: 2400,
      balloonPayment: 19200,
    }),
  );

  input.fees = [
    fee({
      description: "Administrative fee: 1,200 SAR",
      amount: 1200,
      currency: "SAR",
      isRecurring: false,
    }),
  ];

  return input;
}

export function run(): void {
  const result = calculateFinancialMetrics(buildAcceptanceFixture());
  assert.equal(financialMetricsSchema.safeParse(result).success, true);

  // The plainly-worded administrative fee must now be classified mandatory
  // and non-conditional, and included as a known fee.
  const adminFee = result.fees.items.find((item) => item.amount.value === 1200);
  assert.ok(adminFee, "the administrative fee must appear in fees.items");
  assert.equal(adminFee?.mandatory, true, "a plainly-worded fee with no trigger verb must default to mandatory");
  assert.notEqual(adminFee?.conditional, true, "the administrative fee must not be conditional");
  assert.equal(result.fees.totalKnownFees.value, 1200);

  // Financing repayment total: installments (2,400 x 48 = 115,200) + final/balloon payment (19,200) = 134,400.
  assert.equal(result.totalCost.financingRepaymentTotal.value, 134400, "total repayment must be 134,400 SAR");

  // Financing cost: financingRepaymentTotal (134,400) - calculatedBaseCost/principal (96,000) = 38,400.
  assert.equal(result.totalCost.calculatedBaseCost.value, 96000);
  assert.equal(result.totalCost.financingCost.value, 38400, "financing cost must be 38,400 SAR");

  // Known contract cost: down payment (9,600) + installments+final (134,400) + administrative fee (1,200) = 145,200.
  // This is the exact fix for the 144,000 bug — the admin fee must now be included.
  assert.equal(
    result.totalCost.calculatedKnownCost.value,
    145200,
    "calculatedKnownCost must be 145,200 SAR, including the previously-dropped administrative fee",
  );

  // Upfront liquidity requirement: down payment (9,600) + one-time mandatory administrative fee (1,200) = 10,800.
  assert.equal(result.exposure.upfrontExposure.value, 10800, "upfront exposure must be 10,800 SAR");

  console.log("PASS engine.autoFinanceAcceptance.test.ts");
}

run();
