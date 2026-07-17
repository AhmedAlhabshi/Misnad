import assert from "node:assert/strict";
import {
  PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS,
  buildPersonalizedAnalysisPrompt,
  buildPersonalizedAnalysisCorrectionPrompt,
} from "../personalizedAnalysisPrompt";
import { personalizedAnalysisRequestSchema, type PersonalizedAnalysisRequest } from "../personalizedAnalysisSchema";

const REQUEST: PersonalizedAnalysisRequest = personalizedAnalysisRequestSchema.parse({
  analysisLanguage: "en",
  contractType: "employment",
  contractSummary: "An employment agreement between an employer and an employee.",
  clauses: [
    { title: "Probation period", summary: "A 3-month probation period applies.", plainExplanation: "Your employment can end more easily during this period.", riskLevel: "low" },
  ],
  financialConcepts: [
    {
      conceptId: "salary",
      label: "Monthly salary",
      amount: 9000,
      currency: "SAR",
      frequency: "monthly",
      role: "income",
      bucket: "informational",
      mandatory: null,
      conditional: null,
      refundable: null,
      trigger: null,
    },
  ],
  budgetMetrics: {
    monthlyIncome: 9000,
    essentialExpenses: 3000,
    existingMonthlyDebt: 0,
    savings: null,
    currency: "SAR",
    applicableMonthlyOutflow: null,
    applicableUpfrontLiquidity: null,
    availableBeforeContract: 6000,
    availableAfterContract: null,
    contractIncomeRatio: null,
    totalCommitmentRatio: null,
    remainingSavings: null,
    emergencyCoverageMonths: null,
  },
  employmentIncomeMode: "replace_current_income",
});

function testSystemInstructionsForbidCreditDecisionLanguage(): void {
  const forbidden = ["affordable", "unaffordable", "approved", "rejected", "creditworthy", "financially safe"];
  for (const phrase of forbidden) {
    assert.ok(
      PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS.toLowerCase().includes(phrase),
      `system instructions must explicitly forbid the phrase "${phrase}"`,
    );
  }
  console.log("PASS testSystemInstructionsForbidCreditDecisionLanguage");
}

function testSystemInstructionsForbidArithmetic(): void {
  assert.ok(/never perform arithmetic/i.test(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS));
  console.log("PASS testSystemInstructionsForbidArithmetic");
}

function testSystemInstructionsRequireGroundedBasis(): void {
  assert.ok(/"basis"/i.test(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS));
  assert.ok(/grounded/i.test(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS));
  console.log("PASS testSystemInstructionsRequireGroundedBasis");
}

function testSystemInstructionsNameThreeSections(): void {
  assert.ok(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS.includes('"personalImpact"'));
  assert.ok(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS.includes('"thingsToWatch"'));
  assert.ok(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS.includes('"beforeYouSign"'));
  console.log("PASS testSystemInstructionsNameThreeSections");
}

function testSystemInstructionsForbidVagueMagnitudeLanguage(): void {
  assert.ok(/high pressure/i.test(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS));
  assert.ok(/vague qualitative magnitude/i.test(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS));
  assert.ok(/actual (supplied )?numbers/i.test(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS));
  console.log("PASS testSystemInstructionsForbidVagueMagnitudeLanguage");
}

function testSystemInstructionsRequireThingsToWatchToStateInclusion(): void {
  assert.ok(/whether it was included in the deterministic calculation/i.test(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS));
  console.log("PASS testSystemInstructionsRequireThingsToWatchToStateInclusion");
}

function testSystemInstructionsForbidAssertingUnstatedRights(): void {
  assert.ok(/must NEVER assert or imply/i.test(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS));
  assert.ok(/"advice" or "question"/i.test(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS));
  console.log("PASS testSystemInstructionsForbidAssertingUnstatedRights");
}

function testSystemInstructionsDistinguishTheTwoRatios(): void {
  assert.ok(
    /new contract monthly payment as a percentage of income/i.test(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS),
    "system instructions must name the new-contract-only ratio by its full distinguishing phrase",
  );
  assert.ok(
    /total monthly obligations after contract as a percentage of income/i.test(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS),
    "system instructions must name the total-obligations ratio by its full distinguishing phrase",
  );
  assert.ok(
    /never call either one just "contract impact" or "monthly obligation ratio"/i.test(PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS),
    "system instructions must explicitly forbid collapsing both ratios into generic wording",
  );
  console.log("PASS testSystemInstructionsDistinguishTheTwoRatios");
}

function testPromptLabelsBothRatiosDistinctly(): void {
  // Both ratios are a non-employment concept (a monthly commitment the user
  // pays) — employment uses entirely different, income-oriented framing
  // (see `formatEmploymentBudgetMetricsSection`), so this test exercises a
  // non-employment contract type instead of the shared `REQUEST` fixture.
  const requestWithBothRatios = personalizedAnalysisRequestSchema.parse({
    ...REQUEST,
    contractType: "personal_finance",
    employmentIncomeMode: null,
    budgetMetrics: { ...REQUEST.budgetMetrics, contractIncomeRatio: 24, totalCommitmentRatio: 36.7 },
  });
  const prompt = buildPersonalizedAnalysisPrompt(requestWithBothRatios);
  assert.ok(
    prompt.includes("New contract monthly payment as a percentage of income: 24%"),
    "the prompt must label the new-contract-only ratio distinctly from the total-obligations ratio",
  );
  assert.ok(
    prompt.includes("Total monthly obligations after contract"),
    "the prompt must label the total-obligations ratio with its own distinguishing phrase, never reusing the other ratio's wording",
  );
  console.log("PASS testPromptLabelsBothRatiosDistinctly");
}

function testPromptIncludesContractTypeAndLanguageInstruction(): void {
  const prompt = buildPersonalizedAnalysisPrompt(REQUEST);
  assert.ok(prompt.includes('"employment"'));
  assert.ok(/OUTPUT LANGUAGE/.test(prompt));
  assert.ok(/English/.test(prompt));
  console.log("PASS testPromptIncludesContractTypeAndLanguageInstruction");
}

function testPromptIncludesSuppliedFiguresVerbatim(): void {
  const prompt = buildPersonalizedAnalysisPrompt(REQUEST);
  assert.ok(prompt.includes("9000"), "the supplied monthlyIncome value must appear verbatim");
  assert.ok(prompt.includes("Probation period"), "the supplied clause title must appear");
  assert.ok(prompt.includes("Monthly salary"), "the supplied concept label must appear");
  console.log("PASS testPromptIncludesSuppliedFiguresVerbatim");
}

function testPromptNeverContainsPiiShapedContent(): void {
  const prompt = buildPersonalizedAnalysisPrompt(REQUEST);
  assert.ok(!/\[NATIONAL_ID\]|\[IBAN\]|\[PHONE\]|\[EMAIL\]/.test(prompt));
  console.log("PASS testPromptNeverContainsPiiShapedContent");
}

function testCorrectionPromptIncludesValidationErrorAndOriginalData(): void {
  const correctionPrompt = buildPersonalizedAnalysisCorrectionPrompt({
    request: REQUEST,
    previousResponseText: '{"pressurePoints": "not an array"}',
    validationErrorSummary: "- pressurePoints: expected array, got string",
  });
  assert.ok(correctionPrompt.includes("expected array, got string"));
  assert.ok(correctionPrompt.includes('"employment"'), "the correction prompt must still include the original request data");
  console.log("PASS testCorrectionPromptIncludesValidationErrorAndOriginalData");
}

export function run(): void {
  testSystemInstructionsForbidCreditDecisionLanguage();
  testSystemInstructionsForbidArithmetic();
  testSystemInstructionsRequireGroundedBasis();
  testSystemInstructionsNameThreeSections();
  testSystemInstructionsForbidVagueMagnitudeLanguage();
  testSystemInstructionsRequireThingsToWatchToStateInclusion();
  testSystemInstructionsForbidAssertingUnstatedRights();
  testSystemInstructionsDistinguishTheTwoRatios();
  testPromptLabelsBothRatiosDistinctly();
  testPromptIncludesContractTypeAndLanguageInstruction();
  testPromptIncludesSuppliedFiguresVerbatim();
  testPromptNeverContainsPiiShapedContent();
  testCorrectionPromptIncludesValidationErrorAndOriginalData();

  console.log("PASS personalizedAnalysisPrompt.test.ts");
}

run();
