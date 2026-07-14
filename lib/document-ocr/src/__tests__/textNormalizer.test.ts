import assert from "node:assert/strict";
import { normalizeOcrText } from "../textNormalizer";

export function run(): void {
  // 1. Line endings are unified to \n.
  {
    const result = normalizeOcrText("line one\r\nline two\rline three\n");
    assert.equal(result, "line one\nline two\nline three");
    console.log("PASS line endings unified");
  }

  // 2. Null bytes and control characters are stripped without touching surrounding text.
  {
    const result = normalizeOcrText("before\x00middle\x01\x02after");
    assert.equal(result, "beforemiddleafter");
    console.log("PASS null bytes / control characters stripped");
  }

  // 3. Repeated horizontal whitespace collapses to a single space, without touching line structure.
  {
    const result = normalizeOcrText("word1     word2\t\tword3");
    assert.equal(result, "word1 word2 word3");
    console.log("PASS repeated horizontal whitespace collapsed");
  }

  // 4. Runs of 3+ blank lines collapse to exactly one blank line; a single blank line (paragraph break) survives untouched.
  {
    const result = normalizeOcrText("Paragraph one.\n\nParagraph two.\n\n\n\n\nParagraph three.");
    assert.equal(result, "Paragraph one.\n\nParagraph two.\n\nParagraph three.");
    console.log("PASS excessive blank lines collapsed, single paragraph breaks preserved");
  }

  // 5. `--- PAGE N ---` separators survive exactly, including their own line.
  {
    const result = normalizeOcrText("--- PAGE 1 ---\nFirst page text.\n\n--- PAGE 2 ---\nSecond page text.");
    assert.ok(result.includes("--- PAGE 1 ---"));
    assert.ok(result.includes("--- PAGE 2 ---"));
    console.log("PASS page separators preserved");
  }

  // 6. Numbers, currency, percentages, and dates are never altered.
  {
    const input = "Amount: 120,000.50 SAR (4.5%) due on 2024-01-15.";
    const result = normalizeOcrText(input);
    assert.equal(result, input);
    console.log("PASS numbers/currency/percentage/date content untouched");
  }

  // 7. IBAN, national ID/Iqama-shaped numbers, and phone numbers survive intact so PII masking can still detect them afterward.
  {
    const input = "IBAN SA0380000000608010167519, ID 1234567890, phone 0512345678";
    const result = normalizeOcrText(input);
    assert.equal(result, input);
    console.log("PASS IBAN/national-ID/phone patterns untouched");
  }

  // 8. Invisible zero-width/bidi-control characters (which can silently split an otherwise-matchable pattern) are removed.
  {
    const withZeroWidth = "SA038​0000000​608010167519";
    const result = normalizeOcrText(withZeroWidth);
    assert.equal(result, "SA0380000000608010167519");
    console.log("PASS invisible zero-width characters removed, digits rejoined");
  }

  // 9. Leading/trailing whitespace across the whole text is trimmed.
  {
    const result = normalizeOcrText("   \n  Some content here.  \n   ");
    assert.equal(result, "Some content here.");
    console.log("PASS leading/trailing whitespace trimmed");
  }

  console.log("PASS textNormalizer.test.ts");
}

run();
