import assert from "node:assert/strict";
import { classifyFrequencyText, labelSimilarity, normalizeLabel } from "../normalize/text";

export function run(): void {
  assert.equal(classifyFrequencyText("Monthly"), "monthly");
  assert.equal(classifyFrequencyText("paid monthly in advance"), "monthly");
  assert.equal(classifyFrequencyText("شهريا"), "monthly");
  assert.equal(classifyFrequencyText("weekly"), "weekly");
  assert.equal(classifyFrequencyText("quarterly"), "quarterly");
  assert.equal(classifyFrequencyText("annual"), "annual");
  assert.equal(classifyFrequencyText("one-time payment"), "one_time");
  assert.equal(classifyFrequencyText("something unrelated"), null);
  assert.equal(classifyFrequencyText(null), null);

  assert.equal(normalizeLabel("  Monthly   Installment  "), "monthly installment");

  assert.equal(labelSimilarity("Monthly Installment", "Monthly Installment"), 1);
  assert.equal(labelSimilarity("Monthly Installment", "Administration Fee"), 0);
  assert.ok(labelSimilarity("Monthly Installment Payment", "Monthly Installment") > 0.5);

  console.log("PASS normalize.text.test.ts");
}

run();
