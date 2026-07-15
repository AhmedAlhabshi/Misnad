import assert from "node:assert/strict";
import { analyzePersonalizedFinancialImpact } from "../personalizedAnalysisService";
import { ContractAnalysisError, rateLimitedError } from "../errors";
import { personalizedAnalysisRequestSchema, type PersonalizedAnalysisRequest } from "../personalizedAnalysisSchema";
import type { ContractAnalysisProvider, ContractAnalysisProviderRequest } from "../providers/types";

const VALID_REQUEST: PersonalizedAnalysisRequest = personalizedAnalysisRequestSchema.parse({
  analysisLanguage: "en",
  contractType: "auto_finance",
  contractSummary: "A vehicle financing agreement between the buyer and the finance company.",
  clauses: [
    {
      title: "Late payment",
      summary: "A fee applies for late payment.",
      plainExplanation: "Pay on time to avoid extra charges.",
      riskLevel: "medium",
    },
  ],
  financialConcepts: [
    {
      conceptId: "monthly_installment",
      label: "Monthly installment",
      amount: 2400,
      currency: "SAR",
      frequency: "monthly",
      role: "recurring_outflow",
      bucket: "guaranteed",
      mandatory: true,
      conditional: false,
      refundable: null,
      trigger: null,
    },
  ],
  budgetMetrics: {
    monthlyIncome: 12000,
    essentialExpenses: 5000,
    existingMonthlyDebt: 2000,
    savings: 20000,
    currency: "SAR",
    applicableMonthlyOutflow: 2400,
    applicableUpfrontLiquidity: 10800,
    availableBeforeContract: 5000,
    availableAfterContract: 2600,
    contractIncomeRatio: 20,
    totalCommitmentRatio: 36.7,
    remainingSavings: 9200,
    emergencyCoverageMonths: 1,
  },
});

const VALID_RESPONSE = JSON.stringify({
  personalImpact: [{ title: "T", explanation: "E", basis: "B" }],
  thingsToWatch: [],
  beforeYouSign: [],
});

async function testGeminiSuccessSkipsFallback(): Promise<void> {
  let geminiCalls = 0;
  let openRouterCalls = 0;

  const fakeGemini: ContractAnalysisProvider = {
    async generate() {
      geminiCalls += 1;
      return { rawText: VALID_RESPONSE };
    },
  };
  const fakeOpenRouter: ContractAnalysisProvider = {
    async generate() {
      openRouterCalls += 1;
      throw new Error("OpenRouter must not be called when Gemini succeeds");
    },
  };

  const result = await analyzePersonalizedFinancialImpact(VALID_REQUEST, {
    provider: fakeGemini,
    fallbackProvider: fakeOpenRouter,
  });

  assert.equal(geminiCalls, 1);
  assert.equal(openRouterCalls, 0);
  assert.equal(result.personalImpact.length, 1);

  console.log("PASS testGeminiSuccessSkipsFallback");
}

async function testRateLimitedTriggersFallback(): Promise<void> {
  let geminiCalls = 0;
  let capturedPrompt: string | undefined;

  const fakeGemini: ContractAnalysisProvider = {
    async generate() {
      geminiCalls += 1;
      throw rateLimitedError();
    },
  };
  const fakeOpenRouter: ContractAnalysisProvider = {
    async generate(request: ContractAnalysisProviderRequest) {
      capturedPrompt = request.userPrompt;
      return { rawText: VALID_RESPONSE };
    },
  };

  const result = await analyzePersonalizedFinancialImpact(VALID_REQUEST, {
    provider: fakeGemini,
    fallbackProvider: fakeOpenRouter,
  });

  assert.equal(geminiCalls, 1);
  assert.ok(capturedPrompt);
  assert.ok(capturedPrompt!.includes("auto_finance"));
  assert.equal(result.personalImpact.length, 1);

  console.log("PASS testRateLimitedTriggersFallback");
}

async function testSchemaValidationFailureDoesNotFallback(): Promise<void> {
  let geminiCalls = 0;
  let openRouterCalls = 0;

  const fakeGemini: ContractAnalysisProvider = {
    async generate() {
      geminiCalls += 1;
      return { rawText: JSON.stringify({}) };
    },
  };
  const fakeOpenRouter: ContractAnalysisProvider = {
    async generate() {
      openRouterCalls += 1;
      throw new Error("OpenRouter must not be called for a schema validation failure");
    },
  };

  let thrown: unknown;
  try {
    await analyzePersonalizedFinancialImpact(VALID_REQUEST, {
      provider: fakeGemini,
      fallbackProvider: fakeOpenRouter,
    });
  } catch (err) {
    thrown = err;
  }

  assert.equal(geminiCalls, 2, "must exhaust initial + correction attempts");
  assert.equal(openRouterCalls, 0);
  assert.ok(thrown instanceof ContractAnalysisError && thrown.code === "SCHEMA_VALIDATION_FAILED");

  console.log("PASS testSchemaValidationFailureDoesNotFallback");
}

async function testCorrectionAttemptRecoversFromInvalidFirstResponse(): Promise<void> {
  let attempt = 0;

  const fakeGemini: ContractAnalysisProvider = {
    async generate() {
      attempt += 1;
      if (attempt === 1) {
        return { rawText: JSON.stringify({ personalImpact: "not an array" }) };
      }
      return { rawText: VALID_RESPONSE };
    },
  };

  const result = await analyzePersonalizedFinancialImpact(VALID_REQUEST, { provider: fakeGemini });

  assert.equal(attempt, 2);
  assert.equal(result.personalImpact.length, 1);

  console.log("PASS testCorrectionAttemptRecoversFromInvalidFirstResponse");
}

export async function run(): Promise<void> {
  await testGeminiSuccessSkipsFallback();
  await testRateLimitedTriggersFallback();
  await testSchemaValidationFailureDoesNotFallback();
  await testCorrectionAttemptRecoversFromInvalidFirstResponse();

  console.log("PASS personalizedAnalysisService.test.ts");
}

run();
