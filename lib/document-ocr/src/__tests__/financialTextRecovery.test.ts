import assert from "node:assert/strict";
import { recoverFinancialValues, type RecoveredFinancialValue } from "../financialTextRecovery";

function fieldOf(values: readonly RecoveredFinancialValue[], field: string): RecoveredFinancialValue {
  const found = values.find((v) => v.field === field);
  assert.ok(found, `field ${field} must be present in the recovery result`);
  return found!;
}

/** A sanitized reconstruction of the real failed-contract OCR output described in the bug report — no real customer data. */
const CORRUPTED_CONTRACT_TEXT = `
السعر النقدي 0 ريال سعودي (مائة وعشرون ألف ريال فقط)
الدفعة الأولى 9620 0 ريال (أربعة وعشرون ألف ريال)
أصل التمويل 0 ريال (ستة وتسعون ألف ريال)
نسبة الربح 6 سنوياً (خمسة بالمائة)
إجمالي الربح 0 ريال (تسعة عشر ألفاً ومائتان)
إجمالي المبلغ الواجب سداده 0 ريال (مائة وخمسة عشر ألفاً ومائتان)
مدة التمويل 8 شهراً (4 سنوات)
القسط الشهري 0 ريال
جدول الأقساط: 2400 2400 2400 2400 2400
`;

export function run(): void {
  // 1. Individually corrupted lines each recover to the correct value.
  {
    const result = recoverFinancialValues("السعر النقدي 0 ريال (مائة وعشرون ألف ريال)");
    const field = fieldOf(result.values, "cashPrice");
    assert.equal(field.value, 120000);
    assert.equal(field.status, "recovered");
    assert.equal(field.source, "amount_words");
    assert.ok(field.evidence.length > 0);
  }
  console.log("PASS cashPrice recovered from corrupted 0 + amount-words");

  {
    const result = recoverFinancialValues("الدفعة الأولى 9620 0 ريال (أربعة وعشرون ألف ريال)");
    const field = fieldOf(result.values, "downPayment");
    assert.equal(field.value, 24000, "the broken '9620 0' OCR digits must never be used as the value");
    assert.equal(field.status, "recovered");
    assert.equal(field.source, "amount_words");
  }
  console.log("PASS downPayment recovered, broken digit fragments discarded");

  {
    const result = recoverFinancialValues("المبلغ الممول 0 ريال (ستة وتسعون ألف ريال)");
    const field = fieldOf(result.values, "financedAmount");
    assert.equal(field.value, 96000);
    assert.equal(field.source, "amount_words");
  }
  console.log("PASS financedAmount recovered from amount-words");

  {
    const result = recoverFinancialValues("نسبة الربح 6 سنوياً ... (خمسة بالمائة)");
    const field = fieldOf(result.values, "profitRate");
    assert.equal(field.value, 5, "percentage context must win over the corrupted digit '6'");
    assert.equal(field.unit, "percent");
  }
  console.log("PASS profitRate recovered as percentage, not the corrupted digit");

  {
    const result = recoverFinancialValues("مدة التمويل 8 شهراً (4 سنوات)");
    const field = fieldOf(result.values, "loanTermMonths");
    assert.equal(field.value, 48, "4 years must recover to 48 months even though the direct digit read '8'");
    assert.equal(field.source, "duration_equivalence");
    assert.ok(field.evidence.some((e) => e.includes("duration equivalence")), "the recovery must record how 48 was derived from the year figure");
  }
  console.log("PASS loanTermMonths recovered via duration equivalence, with recorded evidence");

  {
    const result = recoverFinancialValues("القسط الشهري 0 ريال. جدول الأقساط: 2400 2400 2400 2400 2400");
    const field = fieldOf(result.values, "monthlyInstallment");
    assert.equal(field.value, 2400);
    assert.equal(field.source, "installment_table");
  }
  console.log("PASS monthlyInstallment recovered from repeated installment-table rows");

  // 2. Full pipeline: every field from the real corrupted fixture recovers to the expected value.
  {
    const result = recoverFinancialValues(CORRUPTED_CONTRACT_TEXT);
    assert.equal(fieldOf(result.values, "cashPrice").value, 120000);
    assert.equal(fieldOf(result.values, "downPayment").value, 24000);
    assert.equal(fieldOf(result.values, "financedAmount").value, 96000);
    assert.equal(fieldOf(result.values, "profitRate").value, 5);
    assert.equal(fieldOf(result.values, "totalProfit").value, 19200);
    assert.equal(fieldOf(result.values, "totalPayable").value, 115200);
    assert.equal(fieldOf(result.values, "loanTermMonths").value, 48);
    assert.equal(fieldOf(result.values, "monthlyInstallment").value, 2400);
  }
  console.log("PASS full corrupted-contract fixture recovers all 8 expected values");

  // 3. Arithmetic consistency fills in a missing field when two related fields are known.
  {
    const result = recoverFinancialValues(
      "السعر النقدي 0 ريال (مائة وعشرون ألف ريال) الدفعة الأولى 0 ريال (أربعة وعشرون ألف ريال)",
    );
    const financedAmount = fieldOf(result.values, "financedAmount");
    assert.equal(financedAmount.value, 96000, "financedAmount must be derivable as cashPrice - downPayment");
    assert.equal(financedAmount.status, "recovered");
    assert.equal(financedAmount.source, "arithmetic_consistency");
  }
  console.log("PASS arithmetic consistency fills in a missing field from two known fields");

  // 4. Ambiguous/missing fields never fabricate a value.
  {
    const result = recoverFinancialValues("لا يوجد أي معلومات مالية في هذا النص على الإطلاق.");
    for (const field of result.values) {
      assert.equal(field.value, null, `${field.field} must remain null when nothing in the text supports a value`);
      assert.equal(field.status, "missing");
    }
  }
  console.log("PASS no financial labels present -> every field stays null/missing, nothing fabricated");

  console.log("PASS financialTextRecovery.test.ts");
}

run();
