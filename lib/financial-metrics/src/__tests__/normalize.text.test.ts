import assert from "node:assert/strict";
import { classifyObligationTypeText } from "../pipeline/classify";
import { classifyFrequencyText, containsAnyKeyword, labelSimilarity, normalizeLabel } from "../normalize/text";

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

  // Arabic definite article ("ال") normalization: real contract text uses it
  // inconsistently, so a keyword list written one way (with or without "ال")
  // must still match text written the other way — this is a general Arabic
  // text concern, not tied to any specific keyword or contract type.
  assert.equal(normalizeLabel("الدفعة المقدمة"), normalizeLabel("دفعة مقدمة"));
  assert.equal(containsAnyKeyword("الدفعة المقدمة", ["دفعة مقدمة"]), true, "a keyword without the definite article must match text that uses it");
  assert.equal(containsAnyKeyword("دفعة مقدمة", ["الدفعة المقدمة"]), true, "a keyword with the definite article must match text that omits it");
  assert.equal(classifyObligationTypeText(null, "الدفعة المقدمة"), "upfront_payment");
  assert.equal(classifyObligationTypeText(null, "Down payment"), "upfront_payment");

  console.log("PASS normalize.text.test.ts");
}

run();
