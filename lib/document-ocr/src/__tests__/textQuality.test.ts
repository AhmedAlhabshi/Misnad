import assert from "node:assert/strict";
import { evaluateTextQuality } from "../textQuality";

export function run(): void {
  // 1. Clean, dense Arabic prose is "good" and does not need OCR.
  {
    const text =
      "هذا عقد تمويل سيارة بين الطرفين. المبلغ الممول هو مئة وعشرون ألف ريال سعودي، والدفعة المقدمة ثلاثون ألف ريال، والقسط الشهري يبلغ ألفين وثلاثمئة ريال لمدة ستين شهرا.".repeat(
        3,
      );
    const result = evaluateTextQuality(text, 1);
    assert.equal(result.quality, "good");
    assert.equal(result.shouldUseOcr, false);
    console.log("PASS good arabic text -> good, no OCR");
  }

  // 2. Clean, dense English prose is "good" and does not need OCR.
  {
    const text =
      "This is an auto finance contract between the parties. The financed amount is one hundred twenty thousand SAR, the down payment is thirty thousand SAR, and the monthly installment is 2300 SAR for sixty months.".repeat(
        3,
      );
    const result = evaluateTextQuality(text, 1);
    assert.equal(result.quality, "good");
    assert.equal(result.shouldUseOcr, false);
    console.log("PASS good english text -> good, no OCR");
  }

  // 3. The exact mojibake example from the spec: garbled Arabic must be detected as poor and route to OCR.
  {
    const text = "Ù…Ø¨Ù„Øº Ø§Ù„ØªÙ…ÙˆÙŠÙ„".repeat(20);
    const result = evaluateTextQuality(text, 1);
    assert.equal(result.quality, "poor");
    assert.equal(result.shouldUseOcr, true);
    assert.ok(result.warnings.some((warning) => warning.startsWith("[MOJIBAKE_DETECTED]")));
    assert.ok(result.metrics.mojibakeRatio > 0);
    console.log("PASS mojibake text -> poor, shouldUseOcr");
  }

  // 4. A near-empty text (typical of a fully scanned PDF with no text layer) is poor and needs OCR.
  {
    const result = evaluateTextQuality("   \n\n  ", 3);
    assert.equal(result.quality, "poor");
    assert.equal(result.shouldUseOcr, true);
    assert.ok(result.warnings.some((warning) => warning.startsWith("[TEXT_TOO_SHORT]")));
    console.log("PASS near-empty text -> poor, shouldUseOcr");
  }

  // 5. Low text density relative to page count (a handful of characters spread across many pages) is poor.
  {
    const result = evaluateTextQuality("Page number only: 1", 10);
    assert.equal(result.shouldUseOcr, true);
    console.log("PASS low density relative to page count -> shouldUseOcr");
  }

  // 6. Unicode replacement characters are a strong distortion signal.
  {
    const text = ("normal text here ��� ".repeat(30));
    const result = evaluateTextQuality(text, 1);
    assert.ok(result.metrics.replacementCharacterCount > 0);
    assert.equal(result.quality, "poor");
    assert.equal(result.shouldUseOcr, true);
    console.log("PASS replacement characters -> poor, shouldUseOcr");
  }

  // 7. Abnormal repetition of a single symbol (e.g. a corrupted rendering artifact) is flagged. `~` is deliberately not one of the recognized punctuation/currency symbols.
  {
    const text = "~".repeat(500) + " some words here to avoid the too-short check entirely yes";
    const result = evaluateTextQuality(text, 1);
    assert.ok(result.warnings.some((warning) => warning.startsWith("[ABNORMAL_REPETITION]")));
    console.log("PASS abnormal single-symbol repetition -> flagged");
  }

  // 8. More unrecognized-symbol noise must score strictly worse than the same prose with little/no noise — the scoring responds proportionally to distortion, not just a pass/fail cliff.
  {
    const cleanText = "Some legitimate contract text with real words describing the agreement terms and conditions.".repeat(3);
    const noisyText = "Some ▓▓▓ legitimate ◆◆◆ contract ●●● text ▲▲▲ with ■■■ real words describing the agreement terms".repeat(3);
    const cleanResult = evaluateTextQuality(cleanText, 1);
    const noisyResult = evaluateTextQuality(noisyText, 1);
    assert.ok(noisyResult.score < cleanResult.score, `noisy score (${noisyResult.score}) must be lower than clean score (${cleanResult.score})`);
    assert.equal(cleanResult.quality, "good");
    console.log("PASS noisier text scores strictly lower than clean text");
  }

  // 9. Numbers/amounts survive as "readable" content and do not themselves count as suspicious.
  {
    const text = "Amount: 120,000 SAR. Rate: 4.5%. Date: 2024-01-15. IBAN: SA0380000000608010167519.".repeat(3);
    const result = evaluateTextQuality(text, 1);
    assert.equal(result.quality, "good");
    console.log("PASS numeric/currency/date content -> good");
  }

  console.log("PASS textQuality.test.ts");
}

run();
