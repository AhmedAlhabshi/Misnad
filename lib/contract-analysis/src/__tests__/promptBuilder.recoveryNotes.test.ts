import assert from "node:assert/strict";
import { buildAnalysisPrompt, buildCorrectionPrompt, type DeterministicRecoveryNote } from "../promptBuilder";

const MASKED_TEXT = "Masked auto finance contract body, unique-marker-9f21ab.";

const RECOVERED_NOTES: DeterministicRecoveryNote[] = [
  {
    field: "cashPrice",
    value: 120000,
    unit: "SAR",
    status: "recovered",
    confidence: "high",
    source: "amount_words",
    evidence: ['label "السعر النقدي" + amount-in-words "مائة وعشرون ألف ريال"'],
  },
];

export function run(): void {
  // 1. Notes present with a usable (recovered/high-confidence) value -> section is inserted before the masked text.
  {
    const prompt = buildAnalysisPrompt(MASKED_TEXT, "auto_finance", "en", RECOVERED_NOTES);
    assert.ok(prompt.includes("DETERMINISTIC OCR RECOVERY NOTES"), "the recovery notes section must be present");
    assert.ok(prompt.includes("cashPrice: 120000 SAR"));
    assert.ok(prompt.includes("amount_words"));

    const notesIndex = prompt.indexOf("DETERMINISTIC OCR RECOVERY NOTES");
    const maskedTextIndex = prompt.indexOf(MASKED_TEXT);
    assert.ok(notesIndex < maskedTextIndex, "the recovery notes section must appear before the masked contract text");
  }
  console.log("PASS recovery notes section is inserted before the masked contract text when notes are usable");

  // 2. No notes at all -> prompt is unchanged (no section, no stray heading).
  {
    const promptWithout = buildAnalysisPrompt(MASKED_TEXT, "auto_finance", "en");
    const promptWithEmpty = buildAnalysisPrompt(MASKED_TEXT, "auto_finance", "en", []);
    assert.equal(promptWithout.includes("DETERMINISTIC OCR RECOVERY NOTES"), false);
    assert.equal(promptWithEmpty.includes("DETERMINISTIC OCR RECOVERY NOTES"), false);
  }
  console.log("PASS omitting recovery notes leaves the prompt unchanged");

  // 3. Only ambiguous/missing values -> no section (nothing usable to report).
  {
    const onlyAmbiguous: DeterministicRecoveryNote[] = [
      { field: "loanTermMonths", value: null, unit: "months", status: "ambiguous", confidence: "low", source: "ocr_digits", evidence: [] },
      { field: "profitRate", value: null, unit: "percent", status: "missing", confidence: "low", source: "ocr_digits", evidence: [] },
    ];
    const prompt = buildAnalysisPrompt(MASKED_TEXT, "auto_finance", "en", onlyAmbiguous);
    assert.equal(prompt.includes("DETERMINISTIC OCR RECOVERY NOTES"), false, "ambiguous/missing-only notes must not produce a section");
  }
  console.log("PASS ambiguous/missing-only notes produce no section");

  // 4. The section instructs the model to prefer readable text and never fabricate for unlisted/ambiguous fields.
  {
    const prompt = buildAnalysisPrompt(MASKED_TEXT, "auto_finance", "en", RECOVERED_NOTES);
    assert.ok(/prefer.*(read|text)/i.test(prompt), "must instruct preferring directly readable text over the notes");
    assert.ok(/null rather than guessing|not a value to copy/i.test(prompt), "must instruct null-preservation over fabrication");
  }
  console.log("PASS the section instructs precedence of readable text and null-preservation for uncertain values");

  // 5. The correction prompt also includes the recovery notes section, still before the masked text.
  {
    const correction = buildCorrectionPrompt({
      maskedText: MASKED_TEXT,
      contractType: "auto_finance",
      analysisLanguage: "en",
      previousResponseText: "{}",
      validationErrorSummary: "- contractType: required",
      recoveryNotes: RECOVERED_NOTES,
    });
    assert.ok(correction.includes("DETERMINISTIC OCR RECOVERY NOTES"));
    const notesIndex = correction.indexOf("DETERMINISTIC OCR RECOVERY NOTES");
    const maskedTextIndex = correction.indexOf(MASKED_TEXT);
    assert.ok(notesIndex < maskedTextIndex);
  }
  console.log("PASS the correction prompt also includes recovery notes before the masked text");

  console.log("PASS promptBuilder.recoveryNotes.test.ts");
}

run();
