import assert from "node:assert/strict";
import { calculateRatios } from "../calculators/ratios";
import { knownMoney, unavailableMoney } from "../utils/metricFactories";

export function run(): void {
  const principal = knownMoney(80000, "SAR", "test");

  // Fee-to-principal.
  {
    const { result } = calculateRatios(
      principal,
      knownMoney(4000, "SAR", "test"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
    );
    assert.equal(result.feesToBaseCost.value, 5);
  }

  // Upfront-to-principal.
  {
    const { result } = calculateRatios(
      principal,
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      knownMoney(8000, "SAR", "test"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
    );
    assert.equal(result.upfrontPaymentToBaseCost.value, 10);
  }

  // Finance-cost ratio (totalCostIncrease): (total - principal) / principal × 100.
  {
    const { result } = calculateRatios(
      principal,
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      knownMoney(88000, "SAR", "test"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
    );
    assert.equal(result.totalCostIncrease.value, 10);
  }

  // An incomplete calculatedKnownCost (below principal, e.g. because duration was
  // unavailable so scheduled payments couldn't be totaled) must be reported
  // unavailable, never a fabricated negative finance-cost ratio.
  {
    const { result } = calculateRatios(
      principal,
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      knownMoney(150, "SAR", "test"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
    );
    assert.equal(result.totalCostIncrease.status, "unavailable");
    assert.equal(result.totalCostIncrease.value, null);
  }

  // Balloon-to-principal.
  {
    const { result } = calculateRatios(
      principal,
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      knownMoney(16000, "SAR", "test"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
    );
    assert.equal(result.balloonPaymentToBaseCost.value, 20);
  }

  // Penalties-to-principal.
  {
    const { result } = calculateRatios(
      principal,
      unavailableMoney("n/a"),
      knownMoney(800, "SAR", "test"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
    );
    assert.equal(result.penaltiesToBaseCost.value, 1);
  }

  // Monthly commitment-to-income ratio.
  {
    const { result } = calculateRatios(
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      knownMoney(2000, "SAR", "test"),
      knownMoney(10000, "SAR", "test"),
    );
    assert.equal(result.recurringPaymentToIncome.value, 20);
  }

  // Missing numerator -> unavailable.
  {
    const { result } = calculateRatios(
      principal,
      unavailableMoney("no fees"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
    );
    assert.equal(result.feesToBaseCost.status, "unavailable");
    assert.ok(result.feesToBaseCost.reason);
  }

  // Missing denominator (no principal) -> unavailable.
  {
    const { result } = calculateRatios(
      unavailableMoney("no principal"),
      knownMoney(4000, "SAR", "test"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
    );
    assert.equal(result.feesToBaseCost.status, "unavailable");
  }

  // Zero denominator -> unavailable, never Infinity.
  {
    const { result } = calculateRatios(
      knownMoney(0, "SAR", "test"),
      knownMoney(100, "SAR", "test"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
    );
    assert.equal(result.feesToBaseCost.status, "unavailable");
    assert.notEqual(result.feesToBaseCost.value, Infinity);
  }

  // Mixed currencies -> unavailable.
  {
    const { result } = calculateRatios(
      knownMoney(80000, "SAR", "test"),
      knownMoney(100, "USD", "test"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
    );
    assert.equal(result.feesToBaseCost.status, "unavailable");
  }

  // Rounding: values are rounded to 2 decimals without floating-point artifacts.
  {
    const { result } = calculateRatios(
      knownMoney(3, "SAR", "test"),
      knownMoney(1, "SAR", "test"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
      unavailableMoney("n/a"),
    );
    // 1/3 * 100 = 33.333... must round to 33.33, not display float noise.
    assert.equal(result.feesToBaseCost.value, 33.33);
  }

  console.log("PASS calculators.ratios.test.ts");
}

run();
