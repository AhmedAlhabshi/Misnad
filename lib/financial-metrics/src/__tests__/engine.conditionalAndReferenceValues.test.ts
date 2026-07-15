import assert from "node:assert/strict";
import { calculateFinancialMetrics } from "../engine";
import { autoFinanceDetails, baseContractUnderstanding, fee, financialObligation, leaseDetails } from "./fixtures/contractUnderstanding";

/**
 * Focused follow-up regression coverage for two generic semantic fixes:
 *
 * 1. A conditional/capped fact worded without an explicit "if"/"penalty"
 *    trigger (e.g. "...capped at SAR 500 when applicable") must still be
 *    classified conditional, never guaranteed — this was previously missed
 *    because `CONDITIONAL_KEYWORDS` only covered explicit trigger words.
 * 2. A generically-worded reference/asset value (e.g. "Vehicle Cash
 *    Price") must survive the pipeline as an informational fact — it was
 *    previously extracted, correctly excluded from payment obligations,
 *    but then silently dropped entirely (no `informationalAmounts[]`
 *    exposure existed for the generic `asset_value` role).
 *
 * Both are proven once on the auto-finance golden fixture and once on a
 * lease fixture, to demonstrate the fix is generic, not auto-finance-specific.
 */
export function run(): void {
  // --- Fix 1: a fee worded "capped at X ... when applicable" (no "if"/"penalty" keyword) must be conditional, not guaranteed ---
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 96000, downPayment: 9600 }));
    input.fees = [
      fee({ description: "Actual collection costs, capped at SAR 500, when applicable", amount: 500, currency: "SAR", isRecurring: false }),
    ];
    const result = calculateFinancialMetrics(input);
    const collectionCost = result.fees.items.find((item) => item.amount.value === 500);
    assert.ok(collectionCost, "the collection cost must still appear as a fee");
    assert.equal(collectionCost?.conditional, true, "'capped at ... when applicable' must be recognized as conditional, not a fixed guaranteed cost");
    assert.equal(collectionCost?.financialRole, "conditional_cost", "the financial role must reflect the conditional nature of the cost");
  }
  console.log("PASS a fee worded 'capped at X, when applicable' (no explicit if/penalty keyword) is classified conditional (auto-finance)");

  // --- Fix 2: a generic 'cash price' reference value must survive as an informational fact, never as a payment obligation ---
  {
    const input = baseContractUnderstanding(
      autoFinanceDetails({ financedAmount: 96000, downPayment: 9600, monthlyInstallment: 2400, loanTermMonths: 48 }),
    );
    input.financialObligations = [
      financialObligation({ description: "Vehicle Cash Price", amount: 120000, currency: "SAR" }),
    ];
    const result = calculateFinancialMetrics(input);

    const cashPrice = result.informationalAmounts.find((item) => item.amount.value === 120000);
    assert.ok(cashPrice, "the 120,000 SAR vehicle cash price must appear in informationalAmounts");
    assert.equal(cashPrice?.type, "asset_value");
    assert.equal(cashPrice?.financialRole, "asset_value");

    const cashPriceAsObligation = result.paymentObligations.find((o) => o.amount.value === 120000);
    assert.equal(cashPriceAsObligation, undefined, "the cash price must never become a payment obligation");
  }
  console.log("PASS a generic 'Vehicle Cash Price' reference value survives the pipeline as an informational fact (auto-finance)");

  // --- Generic regression: the same two fixes proven on a lease, not auto-finance ---
  {
    const input = baseContractUnderstanding(leaseDetails({ monthlyRent: 3000, securityDeposit: 6000, leaseTermMonths: 12 }));
    input.fees = [
      fee({ description: "Late payment fee, capped at SAR 200 per month, when applicable", amount: 200, currency: "SAR", isRecurring: false }),
    ];
    input.financialObligations = [
      financialObligation({ description: "Property cash value", amount: 800000, currency: "SAR" }),
    ];
    const result = calculateFinancialMetrics(input);

    const lateFee = result.fees.items.find((item) => item.amount.value === 200);
    assert.equal(lateFee?.conditional, true, "a lease's capped late fee, worded without 'if'/'penalty', must still be conditional");

    const propertyValue = result.informationalAmounts.find((item) => item.amount.value === 800000);
    assert.ok(propertyValue, "a lease's 'Property cash value' must survive as an informational fact, exactly like a vehicle's cash price");
    assert.equal(propertyValue?.type, "asset_value");
    assert.equal(
      result.paymentObligations.find((o) => o.amount.value === 800000),
      undefined,
      "a property's reference value must never become a payment obligation",
    );
  }
  console.log("PASS both fixes are generic: proven again on a lease fixture, not just auto-finance");

  console.log("PASS engine.conditionalAndReferenceValues.test.ts");
}

run();
