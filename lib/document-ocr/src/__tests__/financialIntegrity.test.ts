import assert from "node:assert/strict";
import { evaluateTextQuality, evaluateFinancialIntegrity } from "../textQuality";

/** Readable Arabic prose, but every financial figure has been corrupted the way the real failing OCR pass corrupted them (digits read as "0", split into fragments, or a percentage misread as a raw digit). Padded with unrelated prose (not repeated financial lines) to reach a realistic per-page character density without creating a second, overlapping set of the same labels. */
const CORRUPTED_FINANCIAL_TEXT = `
هذا عقد تمويل سيارة مبرم بين الطرف الأول والطرف الثاني وفقاً للشروط والأحكام الموضحة أدناه في هذه الوثيقة الرسمية.
السعر النقدي 0 ريال سعودي
الدفعة الأولى 9620 0 ريال
أصل التمويل 0 ريال
نسبة الربح 6 سنوياً
إجمالي الربح 0 ريال
إجمالي المبلغ الواجب سداده 0 ريال
مدة التمويل 8 شهراً
القسط الشهري 0 ريال
يقر الطرفان بأنهما اطلعا على جميع بنود هذا العقد وفهماها ووافقا عليها قبل التوقيع أدناه.
`;

/** The same contract with clean, correctly-read financial figures. */
const CORRECT_FINANCIAL_TEXT = `
هذا عقد تمويل سيارة مبرم بين الطرف الأول والطرف الثاني وفقاً للشروط والأحكام الموضحة أدناه في هذه الوثيقة الرسمية.
السعر النقدي 120000 ريال سعودي
الدفعة الأولى 24000 ريال
أصل التمويل 96000 ريال
نسبة الربح 5 بالمائة سنوياً
إجمالي الربح 19200 ريال
إجمالي المبلغ الواجب سداده 115200 ريال
مدة التمويل 48 شهراً
القسط الشهري 2400 ريال
يقر الطرفان بأنهما اطلعا على جميع بنود هذا العقد وفهماها ووافقا عليها قبل التوقيع أدناه.
`;

/** Ordinary readable prose containing no financial labels at all. */
const NON_FINANCIAL_TEXT =
  "هذا الفصل يشرح تاريخ المدينة وتطورها العمراني على مدى القرون الماضية، وأثر ذلك على حياة السكان اليومية.".repeat(6);

export function run(): void {
  {
    const result = evaluateTextQuality(CORRUPTED_FINANCIAL_TEXT, 1);
    assert.notEqual(result.score, 100, "readable-but-financially-corrupted text must not score a perfect 100");
    assert.notEqual(result.quality, "good", "financial corruption must prevent an overall 'good' verdict");
    assert.equal(result.generalQuality, "good", "the prose itself is clean, so general quality alone stays good");
    assert.ok(result.financial.applicable);
    assert.ok(result.financial.score !== null && result.financial.score < 100);
  }
  console.log("PASS readable-but-corrupted financial text does not score 100 / good");

  {
    const result = evaluateTextQuality(CORRECT_FINANCIAL_TEXT, 1);
    assert.equal(result.quality, "good");
    assert.equal(result.financial.quality, "good");
    assert.equal(result.financial.applicable, true);
  }
  console.log("PASS correct financial text scores good overall and financially");

  {
    const result = evaluateTextQuality(NON_FINANCIAL_TEXT, 1);
    assert.equal(result.financial.applicable, false, "text with no tracked financial label must not be scored financially at all");
    assert.equal(result.financial.score, null);
    assert.equal(result.score, result.generalScore, "non-financial text's overall score must equal its general score, never penalized");
    assert.equal(result.quality, "good");
  }
  console.log("PASS non-financial contract text is not unfairly penalized");

  {
    const result = evaluateFinancialIntegrity(CORRUPTED_FINANCIAL_TEXT);
    assert.ok(result.applicable);
    assert.ok(result.metrics !== null && result.metrics.zeroAmountSuspicionCount > 0, "suspicious zero-amount readings must be counted");
  }
  console.log("PASS evaluateFinancialIntegrity surfaces zero-amount suspicion metrics directly");

  console.log("PASS financialIntegrity.test.ts");
}

run();
