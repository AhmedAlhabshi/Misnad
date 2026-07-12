import assert from "node:assert/strict";
import { moneyMetricSchema } from "../moneyMetric";

export function run(): void {
  // Valid: known value with a currency.
  assert.equal(
    moneyMetricSchema.safeParse({
      value: 500,
      currency: "SAR",
      status: "known",
      source: "clause 3",
      reason: null,
      confidence: "high",
    }).success,
    true,
    "a known value with a currency must be accepted",
  );

  // Valid: estimated value.
  assert.equal(
    moneyMetricSchema.safeParse({
      value: 480,
      currency: "SAR",
      status: "estimated",
      source: "calculated from monthly rent x 12",
      reason: null,
      confidence: "medium",
    }).success,
    true,
    "an estimated value with a currency must be accepted",
  );

  // Valid: unavailable, null value, non-empty reason.
  assert.equal(
    moneyMetricSchema.safeParse({
      value: null,
      currency: null,
      status: "unavailable",
      source: null,
      reason: "not stated anywhere in the contract text",
      confidence: "low",
    }).success,
    true,
    "unavailable with a null value and a reason must be accepted",
  );

  // Valid: zero is a legitimate non-negative value (must not be treated as "missing").
  assert.equal(
    moneyMetricSchema.safeParse({
      value: 0,
      currency: "SAR",
      status: "known",
      source: "clause 4",
      reason: null,
      confidence: "high",
    }).success,
    true,
    "a value of exactly 0 must be accepted and must not be conflated with null",
  );

  // Invalid: negative monetary amount.
  assert.equal(
    moneyMetricSchema.safeParse({
      value: -100,
      currency: "SAR",
      status: "known",
      source: "clause 3",
      reason: null,
      confidence: "high",
    }).success,
    false,
    "a negative monetary value must be rejected",
  );

  // Invalid: unavailable status with a numeric value.
  assert.equal(
    moneyMetricSchema.safeParse({
      value: 100,
      currency: "SAR",
      status: "unavailable",
      source: null,
      reason: "not stated",
      confidence: "low",
    }).success,
    false,
    "status unavailable must require value to be null, even if a currency and reason are present",
  );

  // Invalid: unavailable status without a reason (empty string and null both rejected).
  assert.equal(
    moneyMetricSchema.safeParse({
      value: null,
      currency: null,
      status: "unavailable",
      source: null,
      reason: null,
      confidence: "low",
    }).success,
    false,
    "status unavailable must require a reason (null reason rejected)",
  );
  assert.equal(
    moneyMetricSchema.safeParse({
      value: null,
      currency: null,
      status: "unavailable",
      source: null,
      reason: "   ",
      confidence: "low",
    }).success,
    false,
    "status unavailable must require a non-empty reason (whitespace-only reason rejected)",
  );

  // Invalid: numeric value without a currency.
  assert.equal(
    moneyMetricSchema.safeParse({
      value: 100,
      currency: null,
      status: "known",
      source: "clause 3",
      reason: null,
      confidence: "high",
    }).success,
    false,
    "a numeric value must require a currency",
  );

  console.log("PASS moneyMetric.test.ts");
}

run();
