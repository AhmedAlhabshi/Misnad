import assert from "node:assert/strict";
import { personalizedAnalysisRequestSchema, personalizedAnalysisResponseSchema } from "../personalizedAnalysisSchema";

const VALID_REQUEST = {
  analysisLanguage: "ar",
  contractType: "lease",
  contractSummary: "A residential lease agreement between a landlord and a tenant.",
  clauses: [
    { title: "Security deposit", summary: "A refundable deposit is required before occupancy.", plainExplanation: "You get this back later.", riskLevel: "low" },
  ],
  financialConcepts: [
    {
      conceptId: "security_deposit",
      label: "Security deposit",
      amount: 5000,
      currency: "SAR",
      frequency: null,
      role: "refundable",
      bucket: "guaranteed",
      mandatory: true,
      conditional: false,
      refundable: true,
      trigger: null,
    },
  ],
  budgetMetrics: {
    monthlyIncome: 10000,
    essentialExpenses: 4000,
    existingMonthlyDebt: 0,
    savings: 15000,
    currency: "SAR",
    applicableMonthlyOutflow: 3000,
    applicableUpfrontLiquidity: 5000,
    availableBeforeContract: 6000,
    availableAfterContract: 3000,
    contractIncomeRatio: 30,
    totalCommitmentRatio: 30,
    remainingSavings: 10000,
    emergencyCoverageMonths: 3,
  },
};

function testValidRequestParses(): void {
  const result = personalizedAnalysisRequestSchema.safeParse(VALID_REQUEST);
  assert.ok(result.success, "a fully valid request payload must parse");
  console.log("PASS testValidRequestParses");
}

function testInvalidContractTypeRejected(): void {
  const result = personalizedAnalysisRequestSchema.safeParse({ ...VALID_REQUEST, contractType: "not_a_type" });
  assert.equal(result.success, false, "an invalid contractType must be rejected");
  console.log("PASS testInvalidContractTypeRejected");
}

function testInvalidAnalysisLanguageRejected(): void {
  const result = personalizedAnalysisRequestSchema.safeParse({ ...VALID_REQUEST, analysisLanguage: "fr" });
  assert.equal(result.success, false, "an unsupported analysisLanguage must be rejected");
  console.log("PASS testInvalidAnalysisLanguageRejected");
}

function testOverLongContractSummaryRejected(): void {
  const result = personalizedAnalysisRequestSchema.safeParse({ ...VALID_REQUEST, contractSummary: "a".repeat(501) });
  assert.equal(result.success, false, "contractSummary over 500 chars must be rejected");
  console.log("PASS testOverLongContractSummaryRejected");
}

function testTooManyClausesRejected(): void {
  const clauses = Array.from({ length: 21 }, () => VALID_REQUEST.clauses[0]);
  const result = personalizedAnalysisRequestSchema.safeParse({ ...VALID_REQUEST, clauses });
  assert.equal(result.success, false, "more than 20 clauses must be rejected");
  console.log("PASS testTooManyClausesRejected");
}

function testTooManyConceptsRejected(): void {
  const financialConcepts = Array.from({ length: 41 }, () => VALID_REQUEST.financialConcepts[0]);
  const result = personalizedAnalysisRequestSchema.safeParse({ ...VALID_REQUEST, financialConcepts });
  assert.equal(result.success, false, "more than 40 financial concepts must be rejected");
  console.log("PASS testTooManyConceptsRejected");
}

function testMissingBudgetMetricsRejected(): void {
  const { budgetMetrics: _budgetMetrics, ...withoutBudgetMetrics } = VALID_REQUEST;
  const result = personalizedAnalysisRequestSchema.safeParse(withoutBudgetMetrics);
  assert.equal(result.success, false, "a missing budgetMetrics object must be rejected");
  console.log("PASS testMissingBudgetMetricsRejected");
}

function testValidResponseParses(): void {
  const result = personalizedAnalysisResponseSchema.safeParse({
    personalImpact: [{ title: "T", explanation: "E", basis: "B" }],
    thingsToWatch: [],
    beforeYouSign: [{ type: "advice", title: "T", text: "Do X.", basis: "B" }],
  });
  assert.ok(result.success, "a valid 3-section response must parse");
  console.log("PASS testValidResponseParses");
}

function testResponseRejectsExtraTopLevelStructureMismatch(): void {
  const result = personalizedAnalysisResponseSchema.safeParse({ personalImpact: "not an array", thingsToWatch: [], beforeYouSign: [] });
  assert.equal(result.success, false, "a non-array personalImpact must be rejected");
  console.log("PASS testResponseRejectsExtraTopLevelStructureMismatch");
}

function testResponseRejectsTooManyInsightsPerSection(): void {
  const insight = { title: "T", explanation: "E", basis: "B" };
  const result = personalizedAnalysisResponseSchema.safeParse({
    personalImpact: Array.from({ length: 6 }, () => insight),
    thingsToWatch: [],
    beforeYouSign: [],
  });
  assert.equal(result.success, false, "more than 5 insights in one section must be rejected");
  console.log("PASS testResponseRejectsTooManyInsightsPerSection");
}

function testResponseRejectsOverLongInsightFields(): void {
  const result = personalizedAnalysisResponseSchema.safeParse({
    personalImpact: [{ title: "a".repeat(121), explanation: "E", basis: "B" }],
    thingsToWatch: [],
    beforeYouSign: [],
  });
  assert.equal(result.success, false, "an over-long insight title must be rejected");
  console.log("PASS testResponseRejectsOverLongInsightFields");
}

function testBeforeYouSignRequiresValidType(): void {
  const result = personalizedAnalysisResponseSchema.safeParse({
    personalImpact: [],
    thingsToWatch: [],
    beforeYouSign: [{ type: "not_a_type", title: "T", text: "Do X.", basis: "B" }],
  });
  assert.equal(result.success, false, "beforeYouSign items must have type 'advice' or 'question'");
  console.log("PASS testBeforeYouSignRequiresValidType");
}

function testBeforeYouSignAcceptsQuestionType(): void {
  const result = personalizedAnalysisResponseSchema.safeParse({
    personalImpact: [],
    thingsToWatch: [],
    beforeYouSign: [{ type: "question", title: "T", text: "Ask whether X is possible.", basis: "B" }],
  });
  assert.ok(result.success, "a 'question' type beforeYouSign item must be accepted");
  console.log("PASS testBeforeYouSignAcceptsQuestionType");
}

export function run(): void {
  testValidRequestParses();
  testInvalidContractTypeRejected();
  testInvalidAnalysisLanguageRejected();
  testOverLongContractSummaryRejected();
  testTooManyClausesRejected();
  testTooManyConceptsRejected();
  testMissingBudgetMetricsRejected();
  testValidResponseParses();
  testResponseRejectsExtraTopLevelStructureMismatch();
  testResponseRejectsTooManyInsightsPerSection();
  testResponseRejectsOverLongInsightFields();
  testBeforeYouSignRequiresValidType();
  testBeforeYouSignAcceptsQuestionType();

  console.log("PASS personalizedAnalysisSchema.test.ts");
}

run();
