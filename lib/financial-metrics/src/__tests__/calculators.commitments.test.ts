import assert from "node:assert/strict";
import { calculateRecurringCommitment } from "../calculators/commitments";
import type { PaymentObligation } from "../paymentObligation";
import { knownMoney } from "../utils/metricFactories";

function obligation(overrides: Partial<PaymentObligation>): PaymentObligation {
  return {
    id: "obligation-0",
    label: "Monthly installment",
    type: "recurring_payment",
    amount: knownMoney(1000, "SAR", "test"),
    frequency: "monthly",
    numberOfPayments: null,
    startDate: null,
    endDate: null,
    mandatory: true,
    conditional: null,
    sourceFields: [],
    ...overrides,
  };
}

export function run(): void {
  // Monthly payment.
  {
    const { result } = calculateRecurringCommitment([obligation({ frequency: "monthly", amount: knownMoney(1000, "SAR", "x") })]);
    assert.equal(result.actualMonthlyAmount.value, 1000);
    assert.equal(result.monthlyEquivalent.value, 1000);
    assert.equal(result.annualEquivalent.value, 12000);
  }

  // Weekly payment: monthly equivalent = weekly × 52 / 12.
  {
    const { result } = calculateRecurringCommitment([obligation({ id: "o1", frequency: "weekly", amount: knownMoney(100, "SAR", "x") })]);
    assert.equal(result.monthlyEquivalent.value, Math.round((100 * (52 / 12)) * 100) / 100);
    assert.equal(result.actualMonthlyAmount.status, "unavailable", "a weekly payment is not an 'actual monthly' billed amount");
  }

  // Quarterly payment: ÷ 3.
  {
    const { result } = calculateRecurringCommitment([obligation({ id: "o2", frequency: "quarterly", amount: knownMoney(300, "SAR", "x") })]);
    assert.equal(result.monthlyEquivalent.value, 100);
  }

  // Semiannual payment: ÷ 6.
  {
    const { result } = calculateRecurringCommitment([obligation({ id: "o3", frequency: "semi_annual", amount: knownMoney(600, "SAR", "x") })]);
    assert.equal(result.monthlyEquivalent.value, 100);
  }

  // Annual payment: ÷ 12.
  {
    const { result } = calculateRecurringCommitment([obligation({ id: "o4", frequency: "annual", amount: knownMoney(1200, "SAR", "x") })]);
    assert.equal(result.monthlyEquivalent.value, 100);
  }

  // Daily payment: × 365 / 12.
  {
    const { result } = calculateRecurringCommitment([obligation({ id: "o5", frequency: "daily", amount: knownMoney(10, "SAR", "x") })]);
    assert.equal(result.monthlyEquivalent.value, Math.round((10 * (365 / 12)) * 100) / 100);
  }

  // one_time and unknown/irregular frequencies never contribute to the recurring commitment.
  {
    const { result } = calculateRecurringCommitment([
      obligation({ id: "o6", frequency: "one_time", amount: knownMoney(5000, "SAR", "x") }),
      obligation({ id: "o7", frequency: "irregular", amount: knownMoney(200, "SAR", "x") }),
    ]);
    assert.equal(result.monthlyEquivalent.status, "unavailable");
  }

  // Down payment / final payment / balloon payment are one-time and must not appear in includedObligationIds.
  {
    const monthly = obligation({ id: "monthly", frequency: "monthly", amount: knownMoney(1000, "SAR", "x") });
    const downPayment = obligation({ id: "down", frequency: "one_time", type: "upfront_payment", amount: knownMoney(5000, "SAR", "x") });
    const balloon = obligation({ id: "balloon", frequency: "one_time", type: "balloon_payment", amount: knownMoney(8000, "SAR", "x") });
    const { result } = calculateRecurringCommitment([monthly, downPayment, balloon]);
    assert.deepEqual(result.includedObligationIds, ["monthly"]);
    assert.equal(result.monthlyEquivalent.value, 1000);
  }

  // Refundable deposit: excluded from recurring commitment (it is one-time, not recurring).
  {
    const deposit = obligation({ id: "dep", frequency: "one_time", type: "deposit", amount: knownMoney(2000, "SAR", "x") });
    const { result } = calculateRecurringCommitment([deposit]);
    assert.equal(result.monthlyEquivalent.status, "unavailable");
  }

  // Unknown duration does not block the recurring commitment calculation (it only affects totalCost, tested separately).
  {
    const { result } = calculateRecurringCommitment([obligation({ frequency: "monthly", amount: knownMoney(1000, "SAR", "x") })]);
    assert.equal(result.monthlyEquivalent.status, "known");
  }

  // No qualifying obligations at all.
  {
    const { result } = calculateRecurringCommitment([]);
    assert.equal(result.monthlyEquivalent.status, "unavailable");
    assert.deepEqual(result.includedObligationIds, []);
  }

  // Mixed currencies among qualifying obligations must not be summed.
  {
    const sar = obligation({ id: "sar", frequency: "monthly", amount: knownMoney(1000, "SAR", "x") });
    const usd = obligation({ id: "usd", frequency: "monthly", amount: knownMoney(100, "USD", "x") });
    const { result, metadata } = calculateRecurringCommitment([sar, usd]);
    assert.equal(result.monthlyEquivalent.status, "unavailable");
    assert.ok(metadata.warnings.some((warning) => warning.code === "MIXED_CURRENCY"));
  }

  console.log("PASS calculators.commitments.test.ts");
}

run();
