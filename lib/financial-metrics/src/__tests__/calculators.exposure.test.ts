import assert from "node:assert/strict";
import { calculateExposure } from "../calculators/exposure";
import type { FeeCollection, FeeItem } from "../fee";
import type { PaymentObligation } from "../paymentObligation";
import type { PenaltyCollection, PenaltyItem } from "../penalty";
import type { RecurringCommitment } from "../recurringCommitment";
import { knownMoney, unavailableMoney, unavailablePercentage } from "../utils/metricFactories";

function obligation(overrides: Partial<PaymentObligation>): PaymentObligation {
  return {
    id: "obligation-0",
    label: "Obligation",
    type: "recurring_payment",
    amount: knownMoney(1000, "SAR", "test"),
    frequency: "monthly",
    numberOfPayments: null,
    startDate: null,
    endDate: null,
    mandatory: true,
    conditional: null,
    refundable: null,
    financialRole: "recurring_outflow",
    sourceFields: [],
    ...overrides,
  };
}

function feeItem(overrides: Partial<FeeItem>): FeeItem {
  return {
    id: "fee-0",
    type: "other",
    label: "Fee",
    amount: knownMoney(100, "SAR", "test"),
    percentage: unavailablePercentage("n/a"),
    calculationBase: null,
    frequency: "one_time",
    mandatory: true,
    conditional: null,
    refundable: null,
    financialRole: "one_time_outflow",
    sourceFields: [],
    ...overrides,
  };
}

function penaltyItem(overrides: Partial<PenaltyItem>): PenaltyItem {
  return {
    id: "penalty-0",
    type: "other",
    label: "Penalty",
    amount: knownMoney(50, "SAR", "test"),
    percentage: unavailablePercentage("n/a"),
    calculationBase: null,
    trigger: null,
    maximumAmount: unavailableMoney("n/a"),
    conditional: true,
    financialRole: "conditional_cost",
    sourceFields: [],
    ...overrides,
  };
}

const emptyRecurringCommitment: RecurringCommitment = {
  actualMonthlyAmount: knownMoney(1000, "SAR", "test"),
  monthlyEquivalent: knownMoney(1000, "SAR", "test"),
  annualEquivalent: knownMoney(12000, "SAR", "test"),
  minimumMonthlyAmount: knownMoney(1000, "SAR", "test"),
  maximumMonthlyAmount: knownMoney(1000, "SAR", "test"),
  isVariable: null,
  includedObligationIds: [],
};

function feeCollection(items: FeeItem[], overrides: Partial<FeeCollection> = {}): FeeCollection {
  return {
    items,
    totalKnownFees: unavailableMoney("n/a"),
    mandatoryFees: unavailableMoney("n/a"),
    upfrontFees: unavailableMoney("n/a"),
    recurringFees: unavailableMoney("n/a"),
    conditionalFees: unavailableMoney("n/a"),
    hasUndefinedFees: null,
    status: "unavailable",
    ...overrides,
  };
}

function penaltyCollection(items: PenaltyItem[], overrides: Partial<PenaltyCollection> = {}): PenaltyCollection {
  return {
    items,
    totalKnownPenalties: unavailableMoney("n/a"),
    highestKnownPenalty: unavailableMoney("n/a"),
    hasUndefinedPenalty: null,
    status: "unavailable",
    ...overrides,
  };
}

const noObligationRefundability = new Map<string, boolean | null>();
const noScheduledRecurring = unavailableMoney("n/a");

export function run(): void {
  // Guaranteed exposure = calculatedCoreObligations, passed through directly.
  {
    const coreObligations = knownMoney(18500, "SAR", "test");
    const { result } = calculateExposure([], [], feeCollection([]), penaltyCollection([]), emptyRecurringCommitment, coreObligations, unavailableMoney("n/a"), noObligationRefundability, noScheduledRecurring);
    assert.equal(result.totalKnownExposure.value, 18500);
  }

  // Upfront cash requirement includes a mandatory down payment plus upfront fees.
  {
    const downPayment = obligation({ type: "upfront_payment", frequency: "one_time", amount: knownMoney(5000, "SAR", "test") });
    const fees = feeCollection([feeItem({ frequency: "one_time" })], { upfrontFees: knownMoney(100, "SAR", "test") });
    const { result } = calculateExposure([downPayment], fees.items, fees, penaltyCollection([]), emptyRecurringCommitment, unavailableMoney("n/a"), unavailableMoney("n/a"), noObligationRefundability, noScheduledRecurring);
    assert.equal(result.upfrontExposure.value, 5100);
  }

  // Known conditional exposure combines conditional fees, penalties, and the insurance deductible.
  {
    const fees = feeCollection([], { conditionalFees: knownMoney(30, "SAR", "test") });
    const penalties = penaltyCollection([], { totalKnownPenalties: knownMoney(100, "SAR", "test") });
    const deductible = knownMoney(500, "SAR", "test");
    const { result } = calculateExposure([], [], fees, penalties, emptyRecurringCommitment, unavailableMoney("n/a"), deductible, noObligationRefundability, noScheduledRecurring);
    assert.equal(result.contingentExposure.value, 630);
  }

  // Unresolved (percentage-only) conditional exposure is flagged, not fabricated.
  {
    const unresolvedFee = feeItem({ conditional: true, amount: unavailableMoney("percentage-based") });
    const { result } = calculateExposure([], [unresolvedFee], feeCollection([unresolvedFee]), penaltyCollection([]), emptyRecurringCommitment, unavailableMoney("n/a"), unavailableMoney("n/a"), noObligationRefundability, noScheduledRecurring);
    assert.equal(result.unquantifiedContingentExposure, true);
  }

  // Credit limit must never appear as exposure or a monthly commitment (the calculator is never even given one — verified structurally).
  {
    const { result } = calculateExposure([], [], feeCollection([]), penaltyCollection([]), emptyRecurringCommitment, unavailableMoney("n/a"), unavailableMoney("n/a"), noObligationRefundability, noScheduledRecurring);
    assert.equal(result.monthlyExposure.value, 1000, "monthlyExposure must reflect only the recurring commitment, never a credit limit");
  }

  // Insurance deductible is conditional exposure — it must not be reported as monthlyExposure or upfrontExposure.
  {
    const deductible = knownMoney(750, "SAR", "test");
    const { result } = calculateExposure([], [], feeCollection([]), penaltyCollection([]), emptyRecurringCommitment, unavailableMoney("n/a"), deductible, noObligationRefundability, noScheduledRecurring);
    assert.equal(result.contingentExposure.value, 750);
    assert.notEqual(result.monthlyExposure.value, 750);
    assert.notEqual(result.upfrontExposure.value, 750);
  }

  // Final/balloon payment counted in maximumSinglePayment.
  {
    const balloon = obligation({ id: "balloon", type: "balloon_payment", frequency: "one_time", amount: knownMoney(20000, "SAR", "test") });
    const { result } = calculateExposure([balloon], [], feeCollection([]), penaltyCollection([]), emptyRecurringCommitment, unavailableMoney("n/a"), unavailableMoney("n/a"), noObligationRefundability, noScheduledRecurring);
    assert.equal(result.maximumSinglePayment.value, 20000);
  }

  // Milestone 5.6C: a balloon/final payment is financing repayment, not an
  // upfront (pre-financing) cash requirement — it must count toward
  // maximumSinglePayment (still a real single payment) but never toward
  // upfrontExposure (which feeds ratios.upfrontPaymentToBaseCost).
  {
    const downPayment = obligation({ id: "down", type: "upfront_payment", frequency: "one_time", amount: knownMoney(20000, "SAR", "test") });
    const balloon = obligation({ id: "balloon", type: "balloon_payment", frequency: "one_time", amount: knownMoney(40000, "SAR", "test") });
    const { result } = calculateExposure(
      [downPayment, balloon],
      [],
      feeCollection([]),
      penaltyCollection([]),
      emptyRecurringCommitment,
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      noObligationRefundability,
      noScheduledRecurring,
    );
    assert.equal(result.upfrontExposure.value, 20000, "the balloon payment must never inflate upfrontExposure");
    assert.equal(result.maximumSinglePayment.value, 40000, "the balloon payment is still the largest single payment");
  }

  // Refundable deposit treatment: included in upfront exposure (cash needed now) even though it is not "non-refundable cost".
  {
    const deposit = obligation({ id: "dep", type: "deposit", frequency: "one_time", mandatory: true, amount: knownMoney(2000, "SAR", "test") });
    const { result } = calculateExposure([deposit], [], feeCollection([]), penaltyCollection([]), emptyRecurringCommitment, unavailableMoney("n/a"), unavailableMoney("n/a"), noObligationRefundability, noScheduledRecurring);
    assert.equal(result.upfrontExposure.value, 2000);
  }

  // Deposit with unresolved refundability must never enter maximumSinglePayment/totalsByCurrency, even though (per the prior test) it does count toward upfrontExposure.
  {
    const deposit = obligation({ id: "dep-unresolved", type: "deposit", frequency: "one_time", mandatory: true, amount: knownMoney(9000, "SAR", "test") });
    const { result } = calculateExposure([deposit], [], feeCollection([]), penaltyCollection([]), emptyRecurringCommitment, unavailableMoney("n/a"), unavailableMoney("n/a"), noObligationRefundability, noScheduledRecurring);
    assert.notEqual(result.maximumSinglePayment.value, 9000, "a deposit with unresolved refundability must not become the guaranteed maximum single payment");
    assert.equal(result.totalsByCurrency.length, 0, "a deposit with unresolved refundability must not appear in totalsByCurrency");
  }

  // Multiple currencies must be represented separately in totalsByCurrency, never merged.
  // The SAR side is a mandatory one-time obligation (not recurring) so it is
  // directly eligible without depending on a separately-supplied scheduled
  // recurring total.
  {
    const sarObligation = obligation({ id: "sar", frequency: "one_time", amount: knownMoney(1000, "SAR", "test") });
    const usdFee = feeItem({ id: "usd", amount: knownMoney(50, "USD", "test") });
    const { result } = calculateExposure([sarObligation], [usdFee], feeCollection([usdFee]), penaltyCollection([]), emptyRecurringCommitment, unavailableMoney("n/a"), unavailableMoney("n/a"), noObligationRefundability, noScheduledRecurring);
    const currencies = result.totalsByCurrency.map((entry) => entry.currency);
    assert.ok(currencies.includes("SAR"));
    assert.ok(currencies.includes("USD"));
    assert.equal(result.totalsByCurrency.length, 2);
  }

  // The scheduled recurring total (computed once, shared with `costs.ts`) contributes its own currency bucket to totalsByCurrency.
  {
    const recurring = knownMoney(138000, "SAR", "monthlyEquivalent × contractDuration.months");
    const { result } = calculateExposure([], [], feeCollection([]), penaltyCollection([]), emptyRecurringCommitment, unavailableMoney("n/a"), unavailableMoney("n/a"), noObligationRefundability, recurring);
    const sarEntry = result.totalsByCurrency.find((entry) => entry.currency === "SAR");
    assert.equal(sarEntry?.value, 138000);
  }

  console.log("PASS calculators.exposure.test.ts");
}

run();
