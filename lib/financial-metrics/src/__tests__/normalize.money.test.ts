import assert from "node:assert/strict";
import { normalizeCurrencyCode, parseMoneyString, sanitizeNumericAmount } from "../normalize/money";

export function run(): void {
  // ASCII digits, no separators.
  assert.deepEqual(parseMoneyString("10000"), { value: 10000, currency: null });

  // ASCII thousands separator + decimal.
  assert.deepEqual(parseMoneyString("10,000.50"), { value: 10000.5, currency: null });
  assert.deepEqual(parseMoneyString("10,000"), { value: 10000, currency: null });

  // Arabic-Indic digits.
  assert.deepEqual(parseMoneyString("١٠٠٠٠"), { value: 10000, currency: null });

  // Arabic thousands separator (٬) and decimal separator (٫).
  assert.deepEqual(parseMoneyString("١٠٬٠٠٠"), { value: 10000, currency: null });
  assert.deepEqual(parseMoneyString("١٠٬٠٠٠٫٥٠"), { value: 10000.5, currency: null });

  // Currency after the amount.
  assert.deepEqual(parseMoneyString("10000 SAR"), { value: 10000, currency: "SAR" });

  // Currency before the amount.
  assert.deepEqual(parseMoneyString("SAR 10000"), { value: 10000, currency: "SAR" });

  // Negative sign is parsed (business-rule interpretation of "is this a payment" happens elsewhere).
  assert.deepEqual(parseMoneyString("-500"), { value: -500, currency: null });

  // Invalid numeric strings must not be silently converted.
  assert.equal(parseMoneyString("not a number"), null);
  assert.equal(parseMoneyString("ten thousand"), null);
  assert.equal(parseMoneyString(""), null);
  assert.equal(parseMoneyString("   "), null);
  assert.equal(parseMoneyString("12.34.56"), null);
  assert.equal(parseMoneyString("12abc"), null);

  // NaN / Infinity must never be produced or accepted as text.
  assert.equal(parseMoneyString("NaN"), null);
  assert.equal(parseMoneyString("Infinity"), null);
  assert.equal(parseMoneyString("-Infinity"), null);

  // Already-numeric amounts (as ContractUnderstanding always provides).
  assert.equal(sanitizeNumericAmount(500), 500);
  assert.equal(sanitizeNumericAmount(0), 0);
  assert.equal(sanitizeNumericAmount(null), null);
  assert.equal(sanitizeNumericAmount(undefined), null);
  assert.equal(sanitizeNumericAmount(Number.NaN), null);
  assert.equal(sanitizeNumericAmount(Number.POSITIVE_INFINITY), null);
  assert.equal(sanitizeNumericAmount(Number.NEGATIVE_INFINITY), null);

  // Currency code normalization: already-ISO, known aliases, unmapped -> null (never guessed).
  assert.equal(normalizeCurrencyCode("SAR"), "SAR");
  assert.equal(normalizeCurrencyCode("sar"), "SAR");
  assert.equal(normalizeCurrencyCode("Saudi Riyal"), "SAR");
  assert.equal(normalizeCurrencyCode("ريال سعودي"), "SAR");
  assert.equal(normalizeCurrencyCode("$"), "USD");
  assert.equal(normalizeCurrencyCode("some random unit"), null);
  assert.equal(normalizeCurrencyCode(null), null);
  assert.equal(normalizeCurrencyCode(""), null);

  console.log("PASS normalize.money.test.ts");
}

run();
