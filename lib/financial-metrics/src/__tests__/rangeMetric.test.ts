import assert from "node:assert/strict";
import { moneyRangeMetricSchema } from "../rangeMetric";

function money(value: number | null, currency: string | null, status: "known" | "unavailable" = "known") {
  return {
    value,
    currency,
    status,
    source: status === "known" ? "clause 4" : null,
    reason: status === "known" ? null : "not stated",
    confidence: status === "known" ? "medium" : "low",
  };
}

export function run(): void {
  // Valid: a variable-amount range where minimum is below maximum, same currency.
  assert.equal(
    moneyRangeMetricSchema.safeParse({
      minimum: money(300, "SAR"),
      maximum: money(700, "SAR"),
      status: "known",
      source: "clause 4",
      reason: null,
    }).success,
    true,
    "a valid range with minimum below maximum, same currency, must be accepted",
  );

  // Valid: minimum equal to maximum (a degenerate but legitimate "range").
  assert.equal(
    moneyRangeMetricSchema.safeParse({
      minimum: money(500, "SAR"),
      maximum: money(500, "SAR"),
      status: "known",
      source: "clause 4",
      reason: null,
    }).success,
    true,
    "a range where minimum equals maximum must be accepted",
  );

  // Invalid: minimum greater than maximum.
  assert.equal(
    moneyRangeMetricSchema.safeParse({
      minimum: money(700, "SAR"),
      maximum: money(300, "SAR"),
      status: "known",
      source: "clause 4",
      reason: null,
    }).success,
    false,
    "minimum must not exceed maximum",
  );

  // Invalid: incompatible currencies between minimum and maximum.
  assert.equal(
    moneyRangeMetricSchema.safeParse({
      minimum: money(300, "SAR"),
      maximum: money(700, "USD"),
      status: "known",
      source: "clause 4",
      reason: null,
    }).success,
    false,
    "minimum and maximum currencies must be compatible",
  );

  console.log("PASS rangeMetric.test.ts");
}

run();
