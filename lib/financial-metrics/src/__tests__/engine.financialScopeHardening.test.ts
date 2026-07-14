import assert from "node:assert/strict";
import { calculateFinancialMetrics } from "../engine";
import { financialMetricsSchema } from "../financialMetrics";
import { autoFinanceDetails, baseContractUnderstanding, fee, financialObligation, leaseDetails } from "./fixtures/contractUnderstanding";

/**
 * Regression tests for the real-contract manual-testing bugs (Milestone
 * 5.6C): (1) `calculatedCoreObligations`/`calculatedKnownCost` mixes
 * pre-financing amounts (a down payment) with financing repayment, and
 * `totalCostIncrease` used to compare that mixed total against principal,
 * overstating the financing-cost ratio; (2) bilingual (Arabic/English)
 * restatements of the same obligation were not deduplicated, doubling
 * aggregation; (3) finance-specific ratios must not be fabricated for
 * contract types with no financed principal.
 */
export function run(): void {
  // ---------------------------------------------------------------------
  // Test A — auto finance with an upfront payment: financing scopes must be
  // kept separate, and totalCostIncrease must use the financing-only scope.
  // ---------------------------------------------------------------------
  {
    // typeDetails fields never carry their own currency, so a realistic
    // fixture also includes one currency-bearing item (as a real extraction
    // would) for the contract-wide currency to resolve unambiguously.
    const input = baseContractUnderstanding(
      autoFinanceDetails({ financedAmount: 70000, downPayment: 20000, monthlyInstallment: 1662.5, loanTermMonths: 48 }),
    );
    input.financialObligations = [
      financialObligation({ description: "Down payment", amount: 20000, currency: "SAR", frequency: "one time" }),
    ];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);

    // financing repayment total = 1662.5 * 48 = 79800 (excludes the down payment).
    assert.equal(result.totalCost.financingRepaymentTotal.value, 79800);
    // financing cost = 79800 - 70000 = 9800.
    assert.equal(result.totalCost.financingCost.value, 9800);
    // totalCostIncrease must be 14%, computed from financingCost/principal — never the old, scope-mixed 42.57%.
    assert.equal(result.ratios.totalCostIncrease.value, 14);
    assert.notEqual(result.ratios.totalCostIncrease.value, 42.57);

    // Total customer cash outflow (calculatedCoreObligations) may still equal
    // 99800 as its own, correctly-named metric — it is not the bug, only its
    // prior use as a financing-repayment proxy was.
    assert.equal(result.totalCost.calculatedCoreObligations.value, 99800);
    assert.equal(result.totalCost.calculatedKnownCost.value, 99800);

    // No false stated-total conflict caused by adding the down payment to
    // financing repayment: `differenceFromStated` still compares against
    // `calculatedCoreObligations` (the cash-outflow scope, unaffected by this
    // fix) — a contract whose own "total" line matches that scope is a match,
    // not a spurious conflict introduced by the new financing-only fields.
    const withStatedTotal = baseContractUnderstanding(
      autoFinanceDetails({ financedAmount: 70000, downPayment: 20000, monthlyInstallment: 1662.5, loanTermMonths: 48 }),
    );
    withStatedTotal.financialObligations = [
      financialObligation({ description: "Total amount payable", amount: 99800, currency: "SAR", frequency: "one time" }),
    ];
    const resultWithStated = calculateFinancialMetrics(withStatedTotal);
    assert.equal(resultWithStated.totalCost.differenceFromStated.classification, "match");
  }
  console.log("PASS Test A — auto finance financing scopes are kept separate; totalCostIncrease is 14%, not 42.57%");

  // ---------------------------------------------------------------------
  // Test B — duplicate bilingual obligations must collapse to one each.
  // ---------------------------------------------------------------------
  {
    const input = baseContractUnderstanding(autoFinanceDetails({}));
    input.financialObligations = [
      financialObligation({ description: "الدفعة المقدمة", amount: 20000, currency: "SAR", frequency: "one time" }),
      financialObligation({ description: "Down payment", amount: 20000, currency: "SAR", frequency: "one time" }),
      financialObligation({ description: "القسط الشهري", amount: 1662.5, currency: "SAR", frequency: "monthly" }),
      financialObligation({ description: "Monthly installment", amount: 1662.5, currency: "SAR", frequency: "monthly" }),
    ];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);

    assert.equal(result.paymentObligations.length, 2, "each semantic obligation must be counted once");
    assert.equal(result.paymentObligations.filter((o) => o.amount.value === 20000).length, 1);
    assert.equal(result.paymentObligations.filter((o) => o.amount.value === 1662.5).length, 1);

    // Aggregation must not be doubled: the monthly commitment is 1662.5, never 3325.
    assert.equal(result.recurringCommitment.monthlyEquivalent.value, 1662.5);
    // The down payment must not be counted twice in the cash-outflow total either.
    assert.notEqual(result.totalCost.calculatedCoreObligations.value, 80000);
  }
  console.log("PASS Test B — bilingual duplicate obligations collapse to one each, aggregation is not doubled");

  // ---------------------------------------------------------------------
  // Test C — genuinely separate obligations that merely share a value must
  // never be aggressively deduplicated.
  // ---------------------------------------------------------------------
  {
    const input = baseContractUnderstanding(autoFinanceDetails({}));
    input.financialObligations = [
      financialObligation({ description: "Late document submission fee", amount: 500, currency: "SAR", frequency: "one time", dueDate: "2026-03-01" }),
      financialObligation({ description: "Vehicle inspection fee", amount: 500, currency: "SAR", frequency: "one time", dueDate: "2026-09-01" }),
    ];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);
    assert.equal(result.paymentObligations.filter((o) => o.amount.value === 500).length, 2, "both must remain — different timing/evidence, not a duplicate");
  }
  console.log("PASS Test C — genuinely separate same-value obligations both remain");

  // ---------------------------------------------------------------------
  // Test D — a non-finance contract type (no financed principal at all):
  // finance-specific cost increase must be unavailable with a clear reason,
  // never a fabricated denominator.
  // ---------------------------------------------------------------------
  {
    // A lease's typeDetails fields never carry their own currency, so a
    // currency-bearing fee anchors the contract-wide currency, as in the
    // other fixtures here.
    const input = baseContractUnderstanding(leaseDetails({ monthlyRent: 2000, leaseTermMonths: 12 }));
    input.fees = [fee({ description: "Lease registration fee", amount: 100, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);

    assert.equal(result.totalCost.calculatedBaseCost.status, "unavailable", "a lease has no financed-principal concept");
    assert.equal(result.totalCost.financingRepaymentTotal.status, "unavailable");
    assert.ok(result.totalCost.financingRepaymentTotal.reason, "the unavailable reason must be explicit, not a bare null");
    assert.equal(result.totalCost.financingCost.status, "unavailable");
    assert.equal(result.ratios.totalCostIncrease.status, "unavailable");
    assert.equal(result.ratios.totalCostIncrease.value, null, "never a fabricated ratio for a contract type with no principal to finance");

    // The lease's own recurring commitment is still real and unaffected —
    // this fix must not suppress legitimate, applicable metrics.
    assert.equal(result.recurringCommitment.monthlyEquivalent.value, 2000);
  }
  console.log("PASS Test D — non-finance contract type: finance-specific ratio is unavailable with a clear reason");

  console.log("PASS engine.financialScopeHardening.test.ts");
}

run();
