import assert from "node:assert/strict";
import {
  formatContractDuration,
  formatCount,
  formatMoneyMetric,
  formatPercentageMetric,
} from "../financialFormatters";

const UNAVAILABLE = "Unavailable";
const UNAVAILABLE_AR = "غير متاح";

export function run(): void {
  // 1. SAR formatted in Arabic.
  {
    const display = formatMoneyMetric({ value: 1500, currency: "SAR", reason: null }, "ar", UNAVAILABLE_AR);
    assert.equal(display.kind, "value");
    assert.ok(display.text.includes("1,500") || display.text.includes("1500"), `expected a formatted 1500 in Arabic, got "${display.text}"`);
    assert.ok(/ر\.س|SAR|﷼/.test(display.text), `expected a SAR currency marker in Arabic locale, got "${display.text}"`);
    assert.equal(/[٠-٩]/.test(display.text), false, "digits must stay ASCII/Western even in Arabic locale");
  }

  // 2. USD formatted in English.
  {
    const display = formatMoneyMetric({ value: 250.5, currency: "USD", reason: null }, "en", UNAVAILABLE);
    assert.equal(display.kind, "value");
    assert.ok(display.text.includes("$"), `expected a $ marker, got "${display.text}"`);
    assert.ok(display.text.includes("250.5"), `expected the value 250.5 preserved, got "${display.text}"`);
  }

  // 3. Null currency must never become SAR (or any invented currency).
  {
    const display = formatMoneyMetric({ value: 500, currency: null, reason: null }, "en", UNAVAILABLE);
    assert.equal(display.kind, "value");
    assert.equal(display.currencyUnknown, true);
    assert.equal(/SAR|ر\.س|﷼|\$|USD/.test(display.text), false, `no currency must be invented, got "${display.text}"`);
    assert.ok(display.text.includes("500"));
  }

  // 4. Null value displays unavailable, never "0" and never the literal string "null".
  {
    const display = formatMoneyMetric({ value: null, currency: "SAR", reason: null }, "en", UNAVAILABLE);
    assert.equal(display.kind, "unavailable");
    assert.equal(display.text, UNAVAILABLE);
    assert.equal(display.text.includes("null"), false);
    assert.notEqual(display.text, "0");
  }

  // 5. Zero remains zero — never conflated with unavailable.
  {
    const display = formatMoneyMetric({ value: 0, currency: "SAR", reason: null }, "en", UNAVAILABLE);
    assert.equal(display.kind, "value");
    assert.ok(display.text.includes("0"));
    assert.notEqual(display.text, UNAVAILABLE);
  }

  // 6. Percentage 12.5 must display as 12.5%, never 1250% (no ×100).
  {
    const display = formatPercentageMetric({ value: 12.5, reason: null }, "en", UNAVAILABLE, "%");
    assert.equal(display.kind, "value");
    assert.equal(display.text, "12.5%");
    assert.equal(display.text.includes("1250"), false);
  }
  {
    // Arabic percent sign convention, matching the existing ResultsScreen copy —
    // digits stay ASCII (Western), only the percent sign is localized.
    const display = formatPercentageMetric({ value: 5, reason: null }, "ar", UNAVAILABLE_AR, "٪");
    assert.equal(display.text, "5٪");
    assert.equal(/[٠-٩]/.test(display.text), false, "digits must stay ASCII even in Arabic, matching the existing app convention");
  }

  // 7. Decimal rounding to at most 2 fractional digits.
  {
    const display = formatMoneyMetric({ value: 1234.5678, currency: "USD", reason: null }, "en", UNAVAILABLE);
    assert.ok(display.text.includes("1,234.57"), `expected rounding to 2 decimals, got "${display.text}"`);
  }
  {
    const display = formatPercentageMetric({ value: 33.3333, reason: null }, "en", UNAVAILABLE, "%");
    assert.equal(display.text, "33.33%");
  }

  // 8. Invalid/non-finite values must never render as NaN or Infinity.
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const money = formatMoneyMetric({ value: invalid, currency: "SAR", reason: null }, "en", UNAVAILABLE);
    assert.equal(money.kind, "unavailable", `non-finite value ${invalid} must resolve to unavailable`);
    assert.equal(/NaN|Infinity/.test(money.text), false);

    const percentage = formatPercentageMetric({ value: invalid, reason: null }, "en", UNAVAILABLE, "%");
    assert.equal(percentage.kind, "unavailable");
    assert.equal(/NaN|Infinity/.test(percentage.text), false);
  }

  // 9. An unsupported (but syntactically 3-letter) currency code must not crash.
  {
    assert.doesNotThrow(() => {
      const display = formatMoneyMetric({ value: 100, currency: "ZZZ", reason: null }, "en", UNAVAILABLE);
      assert.equal(display.kind, "value");
      assert.ok(display.text.includes("100"));
      assert.ok(display.text.includes("ZZZ"), "the raw backend currency code must still be shown, not silently dropped");
    });
  }

  // Duration: priority months -> years -> days, at most one secondary equivalent.
  {
    const display = formatContractDuration(
      { value: 36, unit: "months", months: 36, days: 1095, status: "known", reason: null },
      "en",
      UNAVAILABLE,
      { days: "day(s)", weeks: "week(s)", months: "month(s)", years: "year(s)" },
    );
    assert.equal(display.kind, "value");
    assert.equal(display.primaryText, "36 month(s)");
    assert.equal(display.secondaryText, "1,095 day(s)");
  }
  {
    // Years used when months is not populated.
    const display = formatContractDuration(
      { value: 25, unit: "years", months: null, days: null, status: "known", reason: null },
      "en",
      UNAVAILABLE,
      { days: "day(s)", weeks: "week(s)", months: "month(s)", years: "year(s)" },
    );
    assert.equal(display.primaryText, "25 year(s)");
    assert.equal(display.secondaryText, null);
  }
  {
    // Unavailable duration must show the reason, never a fabricated value.
    const display = formatContractDuration(
      { value: null, unit: null, months: null, days: null, status: "unavailable", reason: "no dates or term found" },
      "en",
      UNAVAILABLE,
      { days: "day(s)", weeks: "week(s)", months: "month(s)", years: "year(s)" },
    );
    assert.equal(display.kind, "unavailable");
    assert.equal(display.primaryText, UNAVAILABLE);
    assert.equal(display.reason, "no dates or term found");
  }

  // formatCount is a plain, non-monetary, non-percentage count.
  {
    assert.equal(formatCount(12, "en"), "12");
  }

  console.log("PASS financialFormatters.test.ts");
}

run();
