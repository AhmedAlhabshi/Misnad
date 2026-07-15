import assert from "node:assert/strict";
import { buildAnalysisPrompt, buildCorrectionPrompt } from "../promptBuilder";

export function run(): void {
  const maskedText = "Masked subscription contract body, unique-marker-7bd21e.";

  const arPrompt = buildAnalysisPrompt(maskedText, "subscription", "ar");
  const enPrompt = buildAnalysisPrompt(maskedText, "subscription", "en");

  assert.ok(
    /in Arabic/i.test(arPrompt),
    'analysisLanguage "ar" must produce a clear Arabic-output instruction',
  );
  assert.ok(
    !/in English/i.test(arPrompt),
    'analysisLanguage "ar" must not also instruct English output',
  );

  assert.ok(
    /in English/i.test(enPrompt),
    'analysisLanguage "en" must produce a clear English-output instruction',
  );
  assert.ok(
    !/in Arabic/i.test(enPrompt),
    'analysisLanguage "en" must not also instruct Arabic output',
  );

  const userFacingFields = [
    "contractSummary",
    "contractSummarySimple",
    "parties[].role",
    "parties[].notes",
    "financialObligations[].description",
    "financialObligations[].frequency",
    "dates[].label",
    "dates[].notes",
    "penalties[].description",
    "penalties[].condition",
    "fees[].description",
    "importantClauses[].title",
    "importantClauses[].summary",
    "importantClauses[].plainExplanation",
    "extractedNumbers[].label",
    "missingInformation[].reason",
    "extractionNotes",
  ];
  for (const field of userFacingFields) {
    assert.ok(
      arPrompt.includes(field),
      `the language instruction must explicitly name "${field}" as a field that must follow analysisLanguage`,
    );
  }

  assert.ok(
    /evidence/i.test(arPrompt) && /must be null for now/i.test(arPrompt),
    'the language instruction must explicitly state that "importantClauses[].evidence" must be null for now, regardless of analysisLanguage',
  );
  assert.ok(
    /\[NATIONAL_ID\]/.test(arPrompt),
    "the language instruction must explicitly call out PII placeholders as exempt from translation",
  );

  const correctionPromptAr = buildCorrectionPrompt({
    maskedText,
    contractType: "subscription",
    analysisLanguage: "ar",
    previousResponseText: "{}",
    validationErrorSummary: "- (root): some required field is missing",
  });

  assert.ok(
    /in Arabic/i.test(correctionPromptAr),
    "the correction/retry prompt must preserve the selected analysis language instruction",
  );
  assert.ok(
    correctionPromptAr.includes(maskedText),
    "the correction/retry prompt must still preserve the masked contract text",
  );
  assert.ok(
    correctionPromptAr.includes('"subscription"'),
    "the correction/retry prompt must still preserve the selected contract type",
  );

  const correctionPromptEn = buildCorrectionPrompt({
    maskedText,
    contractType: "subscription",
    analysisLanguage: "en",
    previousResponseText: "{}",
    validationErrorSummary: "- (root): some required field is missing",
  });

  assert.ok(
    /in English/i.test(correctionPromptEn),
    "the correction/retry prompt must reflect an English selection just as reliably as Arabic",
  );

  console.log("PASS promptBuilder.analysisLanguage.test.ts");
}

run();
