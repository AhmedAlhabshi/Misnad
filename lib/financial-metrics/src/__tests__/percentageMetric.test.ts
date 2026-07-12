import assert from "node:assert/strict";
import { percentageMetricSchema } from "../percentageMetric";

export function run(): void {
  // Valid: ordinary known percentage.
  assert.equal(
    percentageMetricSchema.safeParse({
      value: 5.5,
      status: "known",
      source: "clause 6",
      reason: null,
      confidence: "high",
    }).success,
    true,
    "a known percentage must be accepted",
  );

  // Valid: values above 100 are legitimate (e.g. a total-cost increase) and must not be capped.
  assert.equal(
    percentageMetricSchema.safeParse({
      value: 143.2,
      status: "known",
      source: "calculated total cost increase",
      reason: null,
      confidence: "medium",
    }).success,
    true,
    "a percentage above 100 must be accepted — no universal maximum is imposed",
  );

  // Valid: unavailable with a reason.
  assert.equal(
    percentageMetricSchema.safeParse({
      value: null,
      status: "unavailable",
      source: null,
      reason: "insufficient data to calculate this ratio",
      confidence: "low",
    }).success,
    true,
    "unavailable with a reason must be accepted",
  );

  // Invalid: negative percentage.
  assert.equal(
    percentageMetricSchema.safeParse({
      value: -5,
      status: "known",
      source: "clause 6",
      reason: null,
      confidence: "high",
    }).success,
    false,
    "a negative percentage must be rejected",
  );

  // Invalid: unavailable status with a numeric value.
  assert.equal(
    percentageMetricSchema.safeParse({
      value: 10,
      status: "unavailable",
      source: null,
      reason: "insufficient data",
      confidence: "low",
    }).success,
    false,
    "status unavailable must require value to be null",
  );

  // Invalid: unavailable status without a reason.
  assert.equal(
    percentageMetricSchema.safeParse({
      value: null,
      status: "unavailable",
      source: null,
      reason: null,
      confidence: "low",
    }).success,
    false,
    "status unavailable must require a non-empty reason",
  );

  console.log("PASS percentageMetric.test.ts");
}

run();
