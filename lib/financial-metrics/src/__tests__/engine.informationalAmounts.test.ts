import assert from "node:assert/strict";
import { calculateFinancialMetrics } from "../engine";
import { financialMetricsSchema } from "../financialMetrics";
import { autoFinanceDetails, baseContractUnderstanding, fee, financialObligation, leaseDetails } from "./fixtures/contractUnderstanding";

/**
 * Proves the new `informationalAmounts[]` collection: previously,
 * `specialKey`-routed candidates (principal, credit limit, coverage
 * amount, income, a deductible, an outstanding balance, a stated grand
 * total, a stated rate/APR) were extracted internally but never exposed
 * publicly anywhere in `FinancialMetrics` — this is the fix that makes them
 * individually inspectable stated facts, generically across contract types.
 */
export function run(): void {
  // A. auto_finance: principal + APR both become informational amounts, and
  // are never eligible to become payment obligations (never double-counted
  // as an additional payment on top of the installments).
  {
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
    input.fees = [fee({ description: "Administrative fee", amount: 1200, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);

    const principal = result.informationalAmounts.find((item) => item.type === "principal");
    assert.ok(principal, "the financing principal must appear in informationalAmounts");
    assert.equal(principal?.amount.value, 96000);
    assert.equal(principal?.financialRole, "financing_principal");

    const rate = result.informationalAmounts.find((item) => item.type === "rate");
    assert.ok(rate, "the stated APR must appear in informationalAmounts");
    assert.equal(rate?.percentage.value, 8.75);
    assert.equal(rate?.amount.status, "unavailable", "a rate must never carry a fabricated currency amount");
    assert.equal(rate?.financialRole, "rate_or_percentage");

    // The principal must never appear as a payment obligation (it is
    // financing information, not an additional amount the user pays).
    const principalAsObligation = result.paymentObligations.find((o) => o.amount.value === 96000);
    assert.equal(principalAsObligation, undefined, "the principal must never become a payment obligation");

    // The monthly installment obligation must carry the stated installment
    // count (48), reusing the existing numberOfPayments field.
    const installment = result.paymentObligations.find((o) => o.type === "recurring_payment");
    assert.equal(installment?.numberOfPayments, 48, "the installment count must be populated from typeDetails.loanTermMonths");
  }
  console.log("PASS auto_finance: principal and APR are exposed as informational amounts, never as payments");

  // B. A stated grand total (e.g. "Total of Payments") is preserved as its
  // own informational fact, distinct from the per-installment amount —
  // never summed with it, never silently dropped.
  {
    const input = baseContractUnderstanding(
      autoFinanceDetails({ monthlyInstallment: 2400, loanTermMonths: 48 }),
    );
    input.financialObligations = [
      financialObligation({ description: "Total of Payments during the financing term", amount: 115200, currency: "SAR" }),
    ];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);

    const statedTotal = result.informationalAmounts.find((item) => item.type === "stated_total_cost");
    assert.ok(statedTotal, "a stated 'Total of Payments' line must be recognized as a stated total cost");
    assert.equal(statedTotal?.amount.value, 115200);

    // It must never appear as a payment obligation either.
    const asObligation = result.paymentObligations.find((o) => o.amount.value === 115200);
    assert.equal(asObligation, undefined, "a stated grand total must never become its own payment obligation");
  }
  console.log("PASS a stated 'Total of Payments' line is recognized generically and kept informational");

  // C. A different contract type (lease): monthly rent gets its installment
  // count from leaseTermMonths, proving the wiring is generic, not
  // auto-finance-specific.
  {
    const input = baseContractUnderstanding(leaseDetails({ monthlyRent: 3000, leaseTermMonths: 12 }));
    const result = calculateFinancialMetrics(input);
    const rent = result.paymentObligations.find((o) => o.type === "recurring_payment");
    assert.equal(rent?.numberOfPayments, 12, "a lease's monthly rent must carry its own installment count from leaseTermMonths");
  }
  console.log("PASS numberOfPayments wiring is generic across contract types (lease also covered)");

  console.log("PASS engine.informationalAmounts.test.ts");
}

run();
