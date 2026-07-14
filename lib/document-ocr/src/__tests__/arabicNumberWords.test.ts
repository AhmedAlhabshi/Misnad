import assert from "node:assert/strict";
import { parseArabicNumberWords, extractParentheticalAmountWords } from "../arabicNumberWords";

function expectValue(phrase: string, expected: number, label: string): void {
  const result = parseArabicNumberWords(phrase);
  assert.ok(result !== null, `"${label}" must parse (phrase: ${phrase})`);
  assert.equal(result?.value, expected, `"${label}" must equal ${expected}, got ${result?.value}`);
}

export function run(): void {
  expectValue("مائة وعشرون ألف", 120000, "120000");
  expectValue("أربعة وعشرون ألف", 24000, "24000");
  expectValue("ستة وتسعون ألف", 96000, "96000");
  expectValue("تسعة عشر ألفاً ومائتان", 19200, "19200");
  expectValue("مائة وخمسة عشر ألفاً ومائتان", 115200, "115200");
  expectValue("ألفان وأربعمائة", 2400, "2400");
  expectValue("ثمانية وأربعون", 48, "48");
  expectValue("خمسة", 5, "5");
  console.log("PASS all required contract number-word values parse correctly");

  // Spelling variants: مئة/مائة, ألفاً/ألف/آلاف, مئتان/مئتين
  expectValue("مئة وعشرون ألفا", 120000, "مئة variant");
  expectValue("تسعة عشر آلاف ومئتين", 19200, "آلاف + مئتين variant");
  console.log("PASS common spelling variants parse identically");

  // Percentage detection.
  {
    const result = parseArabicNumberWords("خمسة بالمائة");
    assert.ok(result !== null);
    assert.equal(result?.value, 5);
    assert.equal(result?.isPercentage, true, "a percent marker must be detected");
  }
  {
    const result = parseArabicNumberWords("خمسة");
    assert.equal(result?.isPercentage, false, "no percent marker present -> not a percentage");
  }
  console.log("PASS percentage marker detection");

  // Currency filler words are ignored, not treated as parse failures.
  expectValue("مائة وعشرون ألف ريال سعودي فقط", 120000, "with currency filler words");
  console.log("PASS currency filler words ignored without breaking the parse");

  // No recognizable number words at all -> null, never a guessed value.
  {
    const result = parseArabicNumberWords("هذا نص عربي عادي بدون أرقام");
    assert.equal(result, null, "text with no number words must return null, never a fabricated value");
  }
  console.log("PASS non-numeric text returns null");

  // Parenthetical extraction from a full corrupted-OCR-style line.
  {
    const line = "السعر النقدي 0 ريال سعودي (مائة وعشرون ألف ريال فقط)";
    const results = extractParentheticalAmountWords(line);
    assert.equal(results.length, 1);
    assert.equal(results[0].value, 120000);
  }
  console.log("PASS parenthetical amount-words extraction from a real corrupted line");

  console.log("PASS arabicNumberWords.test.ts");
}

run();
