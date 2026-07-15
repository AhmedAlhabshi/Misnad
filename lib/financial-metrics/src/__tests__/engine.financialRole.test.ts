import assert from "node:assert/strict";
import { calculateFinancialMetrics } from "../engine";
import { financialMetricsSchema } from "../financialMetrics";
import {
  autoFinanceDetails,
  baseContractUnderstanding,
  fee,
  financialObligation,
  penalty,
} from "./fixtures/contractUnderstanding";

/**
 * Confirms `financialRole` (and, for obligations, `refundable`) is
 * correctly exposed on `PaymentObligation`/`FeeItem`/`PenaltyItem` across
 * representative real cases — the same generic mapping (internal
 * `CandidateSemanticRole` -> public `FinancialRole`) applies to every
 * contract type, since it rides the same classification pipeline already
 * computed for all of them.
 */
export function run(): void {
  // A monthly installment is a recurring outflow.
  {
    const input = autoFinanceDetails({ monthlyInstallment: 2000, financedAmount: 50000, downPayment: 5000, loanTermMonths: 24 });
    const result = calculateFinancialMetrics(baseContractUnderstanding(input));
    assert.equal(financialMetricsSchema.safeParse(result).success, true);

    const installment = result.paymentObligations.find((o) => o.type === "recurring_payment");
    assert.equal(installment?.financialRole, "recurring_outflow", "a recurring monthly installment must be role recurring_outflow");

    const downPayment = result.paymentObligations.find((o) => o.type === "upfront_payment");
    assert.equal(downPayment?.financialRole, "upfront_liquidity", "a down payment must be role upfront_liquidity");
  }
  console.log("PASS recurring installment and down payment resolve to recurring_outflow/upfront_liquidity");

  // A refundable deposit (explicit "refundable" wording) resolves to financialRole "refundable" and refundable:true.
  {
    const input = baseContractUnderstanding(autoFinanceDetails());
    input.financialObligations = [
      financialObligation({
        description: "Security deposit of 3,000 SAR (refundable at the end of the lease)",
        amount: 3000,
        currency: "SAR",
      }),
    ];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);

    const deposit = result.paymentObligations.find((o) => o.type === "deposit");
    assert.ok(deposit, "the deposit must appear as a payment obligation");
    assert.equal(deposit?.refundable, true, "explicit refundable wording must set refundable:true");
    assert.equal(deposit?.financialRole, "refundable", "a refundable deposit must be role refundable, not a permanent outflow");
  }
  console.log("PASS an explicitly refundable deposit resolves to financialRole refundable");

  // A non-refundable-stated deposit (no refundable wording at all) resolves to upfront_liquidity, not refundable.
  {
    const input = baseContractUnderstanding(autoFinanceDetails());
    input.financialObligations = [
      financialObligation({ description: "Security deposit", amount: 2000, currency: "SAR" }),
    ];
    const result = calculateFinancialMetrics(input);
    const deposit = result.paymentObligations.find((o) => o.type === "deposit");
    assert.equal(deposit?.refundable, null, "refundability must stay unresolved (null), never assumed either way");
    assert.equal(deposit?.financialRole, "upfront_liquidity", "an unresolved-refundability deposit must not be labeled refundable");
  }
  console.log("PASS a deposit with unstated refundability is upfront_liquidity, never assumed refundable");

  // A penalty is always a conditional cost.
  {
    const input = baseContractUnderstanding(autoFinanceDetails());
    input.penalties = [penalty({ description: "Late payment penalty", amount: 100, currency: "SAR", condition: "if payment is late" })];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);
    assert.equal(result.penalties.items[0]?.financialRole, "conditional_cost", "every penalty must be role conditional_cost");
  }
  console.log("PASS a penalty is always financialRole conditional_cost");

  // A mandatory one-time fee explicitly due at signing (e.g. an administrative/signing fee) must
  // resolve to upfront_liquidity, not one_time_outflow — this is the fix for the bug where such a fee
  // was silently excluded from the applicable upfront liquidity used by Financial Analysis (the bare
  // "عند"/"upon" preposition in its description was previously misread as a conditional trigger).
  {
    const input = baseContractUnderstanding(autoFinanceDetails());
    input.fees = [fee({ description: "Mandatory administrative fee: 1,200 SAR, payable upon signing the contract.", amount: 1200, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);

    const signingFee = result.fees.items.find((f) => f.amount.value === 1200);
    assert.ok(signingFee, "the signing fee must appear as a fee item");
    assert.equal(signingFee?.mandatory, true, "a fee described as mandatory and due at signing must resolve mandatory:true");
    assert.equal(signingFee?.conditional, null, "'due upon signing' wording must not be misread as conditional");
    assert.equal(signingFee?.financialRole, "upfront_liquidity", "a one-time fee explicitly due at signing must be role upfront_liquidity");
  }
  console.log("PASS a mandatory one-time fee explicitly due at signing resolves to financialRole upfront_liquidity");

  // The same fee amount with genuinely unstated timing must stay one_time_outflow — timing is never
  // assumed "due now" just because the fee is one-time and mandatory.
  {
    const input = baseContractUnderstanding(autoFinanceDetails());
    input.fees = [fee({ description: "Administrative fee: 1,200 SAR", amount: 1200, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    const untimedFee = result.fees.items.find((f) => f.amount.value === 1200);
    assert.equal(untimedFee?.mandatory, true, "the fee is still mandatory by default");
    assert.equal(untimedFee?.financialRole, "one_time_outflow", "a one-time fee with no stated timing must stay one_time_outflow, never assumed upfront");
  }
  console.log("PASS a one-time fee with genuinely unstated timing stays one_time_outflow, never assumed upfront_liquidity");

  // A final/balloon payment due at the end of the term must stay one_time_outflow, not upfront_liquidity,
  // purely from its own "due later" wording — the frontend no longer needs a hardcoded final_payment
  // exception to exclude it from upfront liquidity.
  {
    const input = baseContractUnderstanding(autoFinanceDetails());
    input.financialObligations = [
      financialObligation({ description: "Final payment of 19,200 SAR due at the end of the financing term.", amount: 19200, currency: "SAR" }),
    ];
    const result = calculateFinancialMetrics(input);
    const finalPayment = result.paymentObligations.find((o) => o.amount.value === 19200);
    assert.ok(finalPayment, "the final payment must appear as a payment obligation");
    assert.equal(finalPayment?.financialRole, "one_time_outflow", "a final/balloon payment due at the end of the term must never resolve to upfront_liquidity");
  }
  console.log("PASS a final/balloon payment due at the end of the term resolves to one_time_outflow, never upfront_liquidity");

  console.log("PASS engine.financialRole.test.ts");
}

run();
