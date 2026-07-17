import assert from "node:assert/strict";
import { calculateFinancialMetrics } from "../engine";
import { financialMetricsSchema } from "../financialMetrics";
import {
  autoFinanceDetails,
  baseContractUnderstanding,
  fee,
  financialObligation,
  leaseDetails,
  penalty,
} from "./fixtures/contractUnderstanding";

/**
 * Regression fixture for the lease-contract financial-classification bug
 * (monthly rent duplicated by its own restated annual figure) plus the
 * accompanying auto-finance regression safety net — see the milestone's own
 * root-cause report for the full narrative. Both fixtures mirror a
 * confirmed, real-world contract's actual numbers rather than synthetic
 * round figures, specifically so the assertions below double as a
 * non-regression contract for both contract types.
 */
export function run(): void {
  // --- Lease: the confirmed residential lease scenario ------------------
  const leaseInput = baseContractUnderstanding(
    leaseDetails({ monthlyRent: 3000, securityDeposit: 2000, leaseTermMonths: 12 }),
  );
  leaseInput.financialObligations = [
    // The same rent obligation restated annually — this is the exact shape
    // that previously survived as a second, undetected recurring payment.
    financialObligation({ description: "Annual rent", amount: 36000, currency: "SAR", frequency: "annual" }),
    // The contract's own stated total due at signing, broken down as
    // first month's rent + deposit + brokerage + admin fee (3000 + 2000 +
    // 1800 + 250 = 7050) — see requirement #11's "prefer the explicitly
    // stated total... when arithmetically consistent" wording.
    financialObligation({ description: "Total due at signing", amount: 7050, currency: "SAR" }),
  ];
  leaseInput.fees = [
    fee({ description: "Brokerage fee", amount: 1800, currency: "SAR", isRecurring: false }),
    fee({ description: "Administrative fee", amount: 250, currency: "SAR", isRecurring: false }),
    fee({
      description: "Minor maintenance cost, up to 500 SAR per incident, when applicable",
      amount: 500,
      currency: "SAR",
      isRecurring: false,
    }),
  ];
  leaseInput.penalties = [
    penalty({ description: "Late payment fee", amount: 150, currency: "SAR", condition: "per late-payment incident" }),
    penalty({
      description: "Maximum total late fees during the contract",
      amount: 450,
      currency: "SAR",
      condition: "capped at 450 SAR for the whole contract term",
    }),
    penalty({
      description: "Early termination compensation",
      amount: 6000,
      currency: "SAR",
      condition: "if the tenant terminates the lease before the end of the term",
    }),
  ];

  const leaseResult = calculateFinancialMetrics(leaseInput);
  assert.equal(financialMetricsSchema.safeParse(leaseResult).success, true);

  // 1. Recurring monthly commitment is exactly the monthly rent — never
  //    doubled by the restated annual figure.
  assert.equal(leaseResult.recurringCommitment.monthlyEquivalent.value, 3000, "monthly rent alone, never 6000");
  assert.equal(leaseResult.recurringCommitment.annualEquivalent.value, 36000, "3000 x 12");
  console.log("PASS lease: recurring monthly commitment is 3,000 (not doubled by the restated annual rent)");

  // 2. The annual rent is still visible (as an informational fact), but is
  //    never a second PaymentObligation.
  const annualEquivalent = leaseResult.informationalAmounts.find((a) => a.type === "annual_equivalent");
  assert.ok(annualEquivalent, "the annual rent must still be visible as an informational fact");
  assert.equal(annualEquivalent!.amount.value, 36000);
  const recurringObligations = leaseResult.paymentObligations.filter(
    (o) => o.financialRole === "recurring_outflow",
  );
  assert.equal(recurringObligations.length, 1, "monthly and annual rent must never both become PaymentObligations");
  assert.equal(recurringObligations[0]!.amount.value, 3000);
  console.log("PASS lease: monthly and annual rent are not double-counted, and the annual figure is still visible");

  // 3. Security deposit — refundable, 2,000.
  const depositObligation = leaseResult.paymentObligations.find((o) => o.type === "deposit");
  assert.ok(depositObligation);
  assert.equal(depositObligation!.amount.value, 2000);
  console.log("PASS lease: refundable security deposit = 2,000");

  // 4. Non-refundable upfront fees — brokerage 1,800 + admin 250 = 2,050.
  // (`fees.upfrontFees` sums every one-time fee regardless of conditionality
  // — `fees.mandatoryFees` is the guaranteed, non-conditional subset, which
  // is what "non-refundable upfront fees" means here; the 500 SAR
  // conditional maintenance cap must never be folded into it.)
  assert.equal(leaseResult.fees.mandatoryFees.value, 2050);
  console.log("PASS lease: non-refundable upfront fees = 2,050 (brokerage 1,800 + administrative 250)");

  // 5. Late fee (150, conditional per-incident) and its aggregate cap (450)
  //    both appear, neither is treated as a guaranteed/additional fee.
  const lateFeePenalty = leaseResult.penalties.items.find((p) => p.amount.value === 150);
  const lateFeeCapPenalty = leaseResult.penalties.items.find((p) => p.amount.value === 450);
  assert.ok(lateFeePenalty, "the 150 SAR per-incident late fee must be present");
  assert.ok(lateFeeCapPenalty, "the 450 SAR aggregate cap must be present");
  assert.equal(lateFeePenalty!.financialRole, "conditional_cost");
  assert.equal(lateFeeCapPenalty!.financialRole, "conditional_cost");
  assert.equal(
    leaseResult.paymentObligations.some((o) => o.amount.value === 150 || o.amount.value === 450),
    false,
    "neither late-fee amount may ever appear as a guaranteed payment obligation",
  );
  console.log("PASS lease: late fee (150, per incident) and its 450 aggregate cap are both present, both conditional, never guaranteed");

  // 6. Early termination compensation — 6,000, exactly once, conditional.
  const terminationPenalties = leaseResult.penalties.items.filter((p) => p.amount.value === 6000);
  assert.equal(terminationPenalties.length, 1, "the 6,000 SAR early-termination compensation must appear exactly once");
  assert.equal(terminationPenalties[0]!.financialRole, "conditional_cost");
  console.log("PASS lease: early termination compensation = 6,000, appears once, conditional");

  // 7. Minor maintenance cap — 500, conditional, never guaranteed/upfront.
  const maintenanceFee = leaseResult.fees.items.find((f) => f.amount.value === 500);
  assert.ok(maintenanceFee);
  assert.equal(maintenanceFee!.conditional, true);
  assert.equal(maintenanceFee!.financialRole, "conditional_cost", "the 500 SAR maintenance cap must never be counted as a mandatory/upfront fee");
  console.log("PASS lease: 500 SAR maintenance cap is conditional-only, never guaranteed or upfront");

  // 8. Duration and payment count.
  assert.equal(leaseResult.contractDuration.months, 12);
  assert.equal(recurringObligations[0]!.numberOfPayments, 12);
  console.log("PASS lease: duration = 12 months, payment count = 12");

  // 9. The contract's own stated "total due at signing" is preserved as an
  //    informational fact (used by the frontend's `selectApplicableUpfrontLiquidity`
  //    — see `financialConcepts.test.ts` for the personalized-analysis-facing assertion).
  const statedDueAtSigning = leaseResult.informationalAmounts.find((a) => a.type === "stated_due_at_signing");
  assert.ok(statedDueAtSigning, "the stated total due at signing must be preserved");
  assert.equal(statedDueAtSigning!.amount.value, 7050);
  console.log("PASS lease: stated total due at signing (7,050) is preserved as an informational fact");

  // --- Auto-finance regression: preserve previously-tested behavior -----
  const autoFinanceInput = baseContractUnderstanding(
    autoFinanceDetails({ financedAmount: 120000, downPayment: 30000, monthlyInstallment: 2300, loanTermMonths: 60 }),
  );
  autoFinanceInput.fees = [fee({ description: "Administrative fee", amount: 1000, currency: "SAR", isRecurring: false })];
  autoFinanceInput.extractedNumbers = [{ label: "Vehicle cash price", value: 150000, unit: "SAR" }];

  const autoFinanceResult = calculateFinancialMetrics(autoFinanceInput);
  assert.equal(financialMetricsSchema.safeParse(autoFinanceResult).success, true);

  assert.equal(autoFinanceResult.recurringCommitment.monthlyEquivalent.value, 2300, "monthly installment remains the recurring commitment");
  assert.equal(autoFinanceResult.contractDuration.months, 60);
  const downPaymentObligation = autoFinanceResult.paymentObligations.find((o) => o.type === "upfront_payment");
  assert.ok(downPaymentObligation);
  assert.equal(downPaymentObligation!.amount.value, 30000, "down payment remains upfront");
  assert.equal(autoFinanceResult.fees.mandatoryFees.value, 1000, "administrative fee = 1,000");
  const principal = autoFinanceResult.informationalAmounts.find((a) => a.type === "principal");
  assert.ok(principal);
  assert.equal(principal!.amount.value, 120000);
  const assetValue = autoFinanceResult.informationalAmounts.find((a) => a.type === "asset_value");
  assert.ok(assetValue);
  assert.equal(assetValue!.amount.value, 150000, "vehicle cash price is informational only");
  assert.equal(
    autoFinanceResult.paymentObligations.some((o) => o.amount.value === 150000 || o.amount.value === 120000),
    false,
    "principal and vehicle value must never appear as payment obligations, let alone recurring ones",
  );
  assert.equal(
    autoFinanceResult.informationalAmounts.some((a) => a.type === "annual_equivalent"),
    false,
    "the lease-only rent-equivalence reclassification must never fire for auto-finance",
  );
  console.log(
    "PASS auto-finance regression: recurring commitment 2,300, duration 60 months, down payment 30,000 upfront, admin fee 1,000, principal/vehicle value never double-counted as recurring obligations",
  );

  console.log("PASS engine.leaseRentEquivalenceAndAutoFinanceRegression.test.ts");
}

run();
