import assert from "node:assert/strict";
import { buildFeeCollection, buildPenaltyCollection, calculateTotalCost } from "../calculators/costs";
import type { ContractDuration } from "../contractDuration";
import type { FeeItem } from "../fee";
import type { PaymentObligation } from "../paymentObligation";
import type { PenaltyItem } from "../penalty";
import type { RecurringCommitment } from "../recurringCommitment";
import { knownMoney, knownPercentage, unavailableMoney, unavailablePercentage } from "../utils/metricFactories";

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
    sourceFields: [],
    ...overrides,
  };
}

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
    sourceFields: [],
    ...overrides,
  };
}

const knownDuration: ContractDuration = {
  value: 12,
  unit: "months",
  months: 12,
  days: null,
  startDate: null,
  endDate: null,
  status: "known",
  source: "test",
  reason: null,
  confidence: "high",
};

const unavailableDuration: ContractDuration = {
  value: null,
  unit: null,
  months: null,
  days: null,
  startDate: null,
  endDate: null,
  status: "unavailable",
  source: null,
  reason: "unknown",
  confidence: "low",
};

function recurringCommitment(monthly: number | null, currency = "SAR"): RecurringCommitment {
  const amount = monthly === null ? unavailableMoney("n/a") : knownMoney(monthly, currency, "test");
  return {
    actualMonthlyAmount: amount,
    monthlyEquivalent: amount,
    annualEquivalent: monthly === null ? unavailableMoney("n/a") : knownMoney(monthly * 12, currency, "test"),
    minimumMonthlyAmount: amount,
    maximumMonthlyAmount: amount,
    isVariable: null,
    includedObligationIds: [],
  };
}

export function run(): void {
  // Mandatory one-time fee.
  {
    const { result } = buildFeeCollection([feeItem({ mandatory: true, conditional: false, frequency: "one_time", amount: knownMoney(200, "SAR", "x") })]);
    assert.equal(result.mandatoryFees.value, 200);
    assert.equal(result.upfrontFees.value, 200);
  }

  // Mandatory recurring fee.
  {
    const { result } = buildFeeCollection([feeItem({ mandatory: true, conditional: false, frequency: "monthly", amount: knownMoney(20, "SAR", "x") })]);
    assert.equal(result.mandatoryFees.value, 20);
    assert.equal(result.recurringFees.value, 20);
  }

  // Conditional fee must not count as mandatory.
  {
    const { result } = buildFeeCollection([feeItem({ mandatory: false, conditional: true, amount: knownMoney(30, "SAR", "x") })]);
    assert.equal(result.mandatoryFees.status, "unavailable");
    assert.equal(result.conditionalFees.value, 30);
  }

  // Percentage-only fee (no known base amount) must not fabricate a monetary value.
  {
    const { result } = buildFeeCollection([
      feeItem({ amount: unavailableMoney("percentage-based, base unknown"), percentage: knownPercentage(5, "test") }),
    ]);
    assert.equal(result.hasUndefinedFees, true);
    assert.equal(result.totalKnownFees.status, "unavailable");
  }

  // Mixed-currency fees cannot be summed into one total.
  {
    const { result } = buildFeeCollection([
      feeItem({ id: "a", amount: knownMoney(100, "SAR", "x") }),
      feeItem({ id: "b", amount: knownMoney(20, "USD", "x") }),
    ]);
    assert.equal(result.totalKnownFees.status, "unavailable");
  }

  // Penalty aggregates.
  {
    const { result } = buildPenaltyCollection([
      penaltyItem({ id: "a", amount: knownMoney(100, "SAR", "x") }),
      penaltyItem({ id: "b", amount: knownMoney(250, "SAR", "x") }),
    ]);
    assert.equal(result.totalKnownPenalties.value, 350);
    assert.equal(result.highestKnownPenalty.value, 250);
  }

  // Insurance premium and deductible are handled independently by the caller — costs.ts only aggregates what it's given.
  // Refundable deposit (fee-modeled): explicitly refundable, must be excluded from mandatoryFees, no flag needed.
  {
    const { result, metadata } = buildFeeCollection([
      feeItem({ label: "Security Deposit", mandatory: true, conditional: false, refundable: true, amount: knownMoney(1000, "SAR", "x") }),
    ]);
    assert.equal(result.items[0].refundable, true);
    assert.equal(result.mandatoryFees.status, "unavailable", "an explicitly refundable deposit must not count as mandatory cost");
    assert.equal(metadata.excludedValues.length, 0, "a confidently-resolved refundable deposit needs no unresolved-item flag");
  }

  // Refundable deposit (fee-modeled): explicitly non-refundable, must count as mandatory cost.
  {
    const { result } = buildFeeCollection([
      feeItem({ label: "Non-refundable Security Deposit", mandatory: true, conditional: false, refundable: false, amount: knownMoney(1000, "SAR", "x") }),
    ]);
    assert.equal(result.mandatoryFees.value, 1000);
  }

  // Refundable deposit (fee-modeled): unknown refundability must be excluded from mandatoryFees
  // (not silently assumed non-refundable) BUT flagged via an excluded value (not silently
  // assumed refundable either, unlike the explicitly-refundable case above, which needs no flag).
  {
    const { result, metadata } = buildFeeCollection([
      feeItem({ label: "Security Deposit", mandatory: true, conditional: false, refundable: null, amount: knownMoney(1000, "SAR", "x") }),
    ]);
    assert.equal(result.mandatoryFees.status, "unavailable");
    assert.equal(metadata.excludedValues.length, 1);
    assert.equal(metadata.excludedValues[0].reasonCode, "deposit_refundability_unresolved");
    assert.equal(metadata.excludedValues[0].value, 1000);
  }

  // An ordinary (non-deposit) fee with unresolved refundable is unaffected — refundability was
  // never a relevant question for it, so it still counts as mandatory cost as before.
  {
    const { result } = buildFeeCollection([
      feeItem({ label: "Administration fee", mandatory: true, conditional: false, refundable: null, amount: knownMoney(100, "SAR", "x") }),
    ]);
    assert.equal(result.mandatoryFees.value, 100);
  }

  // TotalCost: stated vs. calculated total cost, known duration.
  {
    const principal = knownMoney(80000, "SAR", "test");
    const stated = knownMoney(95000, "SAR", "test");
    const commitment = recurringCommitment(1500);
    const mandatoryFees = knownMoney(500, "SAR", "test");
    const { result } = calculateTotalCost(principal, [], new Map(), mandatoryFees, commitment, knownDuration, stated);
    assert.equal(result.calculatedBaseCost.value, 80000);
    // 1500 * 12 + 500 = 18500
    assert.equal(result.calculatedCoreObligations.value, 18500);
    assert.equal(result.differenceFromStated.classification, "conflict", "95000 stated vs ~18500 calculated is a large, real difference in this synthetic fixture");
  }

  // Unknown duration must not multiply a recurring fee by an invented period.
  {
    const principal = knownMoney(80000, "SAR", "test");
    const commitment = recurringCommitment(1500);
    const { result } = calculateTotalCost(
      principal,
      [],
      new Map(),
      unavailableMoney("none"),
      commitment,
      unavailableDuration,
      unavailableMoney("none"),
    );
    assert.equal(result.calculatedCoreObligations.status, "unavailable");
  }

  // calculatedKnownCost equals calculatedCoreObligations exactly — it must never include
  // conditional/contingent amounts merely because their monetary value is known. Since
  // `calculateTotalCost` no longer accepts a conditional-fees-and-penalties parameter at all,
  // there is no code path through which a conditional amount could ever reach either field.
  {
    const principal = knownMoney(80000, "SAR", "test");
    const commitment = recurringCommitment(1500);
    const { result } = calculateTotalCost(principal, [], new Map(), knownMoney(500, "SAR", "test"), commitment, knownDuration, unavailableMoney("none"));
    assert.equal(result.calculatedKnownCost.value, result.calculatedCoreObligations.value);
    assert.equal(result.calculatedKnownCost.value, 18500);
  }

  // Deposit obligation (PaymentObligation-modeled, e.g. a lease security deposit): explicitly
  // refundable is excluded from calculatedCoreObligations, no flag needed.
  {
    const principal = knownMoney(80000, "SAR", "test");
    const commitment = recurringCommitment(1500);
    const deposit = obligation({ id: "obligation-0", type: "deposit", frequency: "one_time", amount: knownMoney(3000, "SAR", "test") });
    const { result, metadata } = calculateTotalCost(
      principal,
      [deposit],
      new Map([["obligation-0", true]]),
      unavailableMoney("none"),
      commitment,
      knownDuration,
      unavailableMoney("none"),
    );
    // 1500 * 12 = 18000 (the refundable deposit does not add to it)
    assert.equal(result.calculatedCoreObligations.value, 18000);
    assert.equal(metadata.excludedValues.length, 0);
  }

  // Deposit obligation: explicitly non-refundable is included.
  {
    const principal = knownMoney(80000, "SAR", "test");
    const commitment = recurringCommitment(1500);
    const deposit = obligation({ id: "obligation-0", type: "deposit", frequency: "one_time", amount: knownMoney(3000, "SAR", "test") });
    const { result } = calculateTotalCost(
      principal,
      [deposit],
      new Map([["obligation-0", false]]),
      unavailableMoney("none"),
      commitment,
      knownDuration,
      unavailableMoney("none"),
    );
    assert.equal(result.calculatedCoreObligations.value, 21000);
  }

  // Deposit obligation: unknown refundability is excluded from guaranteed cost (not assumed
  // non-refundable) but flagged (not silently assumed refundable either).
  {
    const principal = knownMoney(80000, "SAR", "test");
    const commitment = recurringCommitment(1500);
    const deposit = obligation({ id: "obligation-0", type: "deposit", frequency: "one_time", amount: knownMoney(3000, "SAR", "test") });
    const { result, metadata } = calculateTotalCost(
      principal,
      [deposit],
      new Map([["obligation-0", null]]),
      unavailableMoney("none"),
      commitment,
      knownDuration,
      unavailableMoney("none"),
    );
    assert.equal(result.calculatedCoreObligations.value, 18000, "an unresolved-refundability deposit must not be counted as guaranteed cost");
    assert.equal(metadata.excludedValues.length, 1);
    assert.equal(metadata.excludedValues[0].reasonCode, "deposit_refundability_unresolved");
    assert.equal(metadata.excludedValues[0].value, 3000);
  }

  // A missing map entry (candidate's refundable was never recorded) is treated the same as
  // explicit `null` — unresolved, never silently assumed refundable.
  {
    const principal = knownMoney(80000, "SAR", "test");
    const commitment = recurringCommitment(1500);
    const deposit = obligation({ id: "obligation-0", type: "deposit", frequency: "one_time", amount: knownMoney(3000, "SAR", "test") });
    const { result, metadata } = calculateTotalCost(principal, [deposit], new Map(), unavailableMoney("none"), commitment, knownDuration, unavailableMoney("none"));
    assert.equal(result.calculatedCoreObligations.value, 18000);
    assert.equal(metadata.excludedValues.length, 1);
  }

  // Non-deposit one-time obligations (e.g. a down payment) are unaffected by refundability at all.
  {
    const principal = knownMoney(80000, "SAR", "test");
    const commitment = recurringCommitment(1500);
    const downPayment = obligation({ id: "obligation-0", type: "upfront_payment", frequency: "one_time", amount: knownMoney(10000, "SAR", "test") });
    const { result } = calculateTotalCost(principal, [downPayment], new Map(), unavailableMoney("none"), commitment, knownDuration, unavailableMoney("none"));
    assert.equal(result.calculatedCoreObligations.value, 28000);
  }

  // Milestone 5.6C financial-scope model: a down payment (pre-financing) and
  // a balloon payment (financing repayment) split into different scopes,
  // even though both are "one-time, mandatory" obligations. The reported
  // bug: comparing a total that mixes both scopes against principal
  // overstated the financing-cost ratio.
  {
    const principal = knownMoney(70000, "SAR", "test");
    const commitment = recurringCommitment(1662.5); // 1662.5 * 48 = 79800
    const duration48Months = { ...knownDuration, months: 48 };
    const downPayment = obligation({ id: "obligation-0", type: "upfront_payment", frequency: "one_time", amount: knownMoney(20000, "SAR", "test") });
    const { result } = calculateTotalCost(
      principal,
      [downPayment],
      new Map(),
      unavailableMoney("none"),
      commitment,
      duration48Months,
      unavailableMoney("none"),
    );
    // calculatedCoreObligations (total cash outflow) still mixes both scopes: 20000 + 79800 = 99800.
    assert.equal(result.calculatedCoreObligations.value, 99800);
    // financingRepaymentTotal excludes the down payment: 1662.5 * 48 = 79800 (no balloon here).
    assert.equal(result.financingRepaymentTotal.value, 79800);
    // financingCost = 79800 - 70000 = 9800, never 99800 - 70000 = 29800.
    assert.equal(result.financingCost.value, 9800);
  }

  // A balloon payment counts toward financingRepaymentTotal (financing
  // repayment), not the pre-financing upfront scope, even though it is a
  // one-time, mandatory obligation exactly like a down payment structurally.
  {
    const principal = knownMoney(50000, "SAR", "test");
    const commitment = recurringCommitment(1000); // 1000 * 12 = 12000
    const balloon = obligation({ id: "balloon", type: "balloon_payment", frequency: "one_time", amount: knownMoney(40000, "SAR", "test") });
    const { result } = calculateTotalCost(principal, [balloon], new Map(), unavailableMoney("none"), commitment, knownDuration, unavailableMoney("none"));
    // financingRepaymentTotal = 12000 (recurring) + 40000 (balloon) = 52000.
    assert.equal(result.financingRepaymentTotal.value, 52000);
    assert.equal(result.financingCost.value, 2000, "52000 - 50000 = 2000");
    // calculatedCoreObligations also includes the balloon: 12000 + 40000 = 52000 (no separate upfront amount here).
    assert.equal(result.calculatedCoreObligations.value, 52000);
  }

  // financingRepaymentTotal/financingCost are unavailable — with a clear
  // reason, never a fabricated denominator — when no financed principal was
  // found at all (e.g. a lease or subscription, which have no "principal"
  // concept), even though a recurring commitment exists.
  {
    const commitment = recurringCommitment(2000);
    const { result } = calculateTotalCost(
      unavailableMoney("no principal in this contract type"),
      [],
      new Map(),
      unavailableMoney("none"),
      commitment,
      knownDuration,
      unavailableMoney("none"),
    );
    assert.equal(result.financingRepaymentTotal.status, "unavailable");
    assert.ok(result.financingRepaymentTotal.reason);
    assert.equal(result.financingCost.status, "unavailable");
    // calculatedCoreObligations is unaffected by the missing principal — a lease's total rent is still a real cash-outflow total.
    assert.equal(result.calculatedCoreObligations.value, 24000);
  }

  console.log("PASS calculators.costs.test.ts");
}

run();
