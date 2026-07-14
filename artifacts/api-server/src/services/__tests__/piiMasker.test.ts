import assert from "node:assert/strict";
import { maskPii } from "../piiMasker";

export function run(): void {
  // 1. The exact reported bug: a commercial registration number adjacent to
  // "سجل تجاري" must not be labeled [NATIONAL_ID], while the customer's real
  // national ID in the same document is still correctly masked.
  {
    const text = "السجل التجاري: 1010456789. رقم الهوية الوطنية للعميل: 1098765432.";
    const { maskedText, statistics } = maskPii(text);
    assert.equal(maskedText.includes("1010456789"), false, "the raw CR digits must never remain in the masked text");
    assert.equal(maskedText.includes("1098765432"), false, "the raw national ID digits must never remain in the masked text");
    assert.ok(maskedText.includes("[COMMERCIAL_REGISTRATION]"), "the CR number must be masked with its own placeholder");
    assert.ok(maskedText.includes("[NATIONAL_ID]"), "the real national ID must still be masked as such");
    assert.equal(statistics.commercialRegistrations, 1);
    assert.equal(statistics.nationalIds, 1);
  }
  console.log("PASS commercial registration is not misclassified as national ID; the real national ID is still masked");

  // 2. English label variant.
  {
    const text = "Commercial Registration Number: 1010456789";
    const { maskedText, statistics } = maskPii(text);
    assert.ok(maskedText.includes("[COMMERCIAL_REGISTRATION]"));
    assert.equal(statistics.commercialRegistrations, 1);
    assert.equal(statistics.nationalIds, 0);
  }
  console.log("PASS English 'Commercial Registration' label is recognized");

  // 3. Bare "CR" label variant (word-bounded, case-insensitive).
  {
    const text = "CR: 1010456789";
    const { maskedText, statistics } = maskPii(text);
    assert.ok(maskedText.includes("[COMMERCIAL_REGISTRATION]"));
    assert.equal(statistics.commercialRegistrations, 1);
  }
  console.log("PASS bare 'CR' label is recognized");

  // 4. Multiline: the label and the number are on separate lines (a common table/form layout).
  {
    const text = "السجل التجاري\n1010456789\n";
    const { maskedText, statistics } = maskPii(text);
    assert.ok(maskedText.includes("[COMMERCIAL_REGISTRATION]"), "context detection must span line breaks");
    assert.equal(statistics.commercialRegistrations, 1);
  }
  console.log("PASS multiline label-then-number layout is recognized");

  // 5. No context label at all: an unlabeled 1-prefixed 10-digit number must default to [NATIONAL_ID] (unchanged prior behavior — protection is never reduced).
  {
    const text = "The applicant's ID number is 1098765432 on file.";
    const { maskedText, statistics } = maskPii(text);
    assert.ok(maskedText.includes("[NATIONAL_ID]"));
    assert.equal(statistics.commercialRegistrations, 0);
    assert.equal(statistics.nationalIds, 1);
  }
  console.log("PASS an unlabeled number defaults to [NATIONAL_ID], preserving prior behavior");

  // 6. Two numbers, two different nearby labels — each must classify independently by its own nearest label.
  {
    const text = "السجل التجاري: 1010456789 - رقم الهوية الوطنية: 1098765432";
    const { statistics } = maskPii(text);
    assert.equal(statistics.commercialRegistrations, 1);
    assert.equal(statistics.nationalIds, 1);
  }
  console.log("PASS two numbers with two distinct nearby labels each classify independently");

  // 7. Iqama numbers (2-prefixed) are unaffected by this change.
  {
    const text = "رقم الإقامة: 2012345678";
    const { maskedText, statistics } = maskPii(text);
    assert.ok(maskedText.includes("[IQAMA]"));
    assert.equal(statistics.iqamaNumbers, 1);
    assert.equal(statistics.commercialRegistrations, 0);
  }
  console.log("PASS Iqama numbers are unaffected");

  console.log("PASS piiMasker.test.ts");
}

run();
