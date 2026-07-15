import assert from "node:assert/strict";
import { analyzeContract } from "../service";
import { ContractAnalysisError, rateLimitedError } from "../errors";
import type {
  ContractAnalysisProvider,
  ContractAnalysisProviderRequest,
} from "../providers/types";

const VALID_CREDIT_CARD_RESPONSE = JSON.stringify({
  contractType: "credit_card",
  detectedContractType: "credit_card",
  contractSummary: "Contract summary.",
  contractSummarySimple: "Simple contract summary.",
  parties: [],
  financialObligations: [],
  dates: [],
  penalties: [],
  fees: [],
  importantClauses: [],
  extractedNumbers: [],
  missingInformation: [],
  extractionNotes: null,
  typeDetails: {
    contractType: "credit_card",
    creditLimit: null,
    annualFee: null,
    interestRateApr: null,
    minimumPaymentPercentage: null,
    lateFee: null,
    cashAdvanceFee: null,
  },
});

async function testGeminiSuccessSkipsFallback(): Promise<void> {
  let geminiCalls = 0;
  let openRouterCalls = 0;

  const fakeGemini: ContractAnalysisProvider = {
    async generate() {
      geminiCalls += 1;
      return { rawText: VALID_CREDIT_CARD_RESPONSE };
    },
  };
  const fakeOpenRouter: ContractAnalysisProvider = {
    async generate() {
      openRouterCalls += 1;
      throw new Error("OpenRouter must not be called when Gemini succeeds");
    },
  };

  const result = await analyzeContract("masked text, unique-marker-aa11.", "credit_card", "ar", {
    provider: fakeGemini,
    fallbackProvider: fakeOpenRouter,
  });

  assert.equal(geminiCalls, 1, "Gemini must be called exactly once");
  assert.equal(openRouterCalls, 0, "OpenRouter must not be called when Gemini succeeds");
  assert.equal(result.contractType, "credit_card");

  console.log("PASS testGeminiSuccessSkipsFallback");
}

async function testRateLimitedTriggersFallbackWithSameInputs(): Promise<void> {
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
      if (!capturedPrompt) {
        capturedPrompt = request.userPrompt;
      }
      return { rawText: VALID_CREDIT_CARD_RESPONSE };
    },
  };

  const maskedText = "Masked credit card contract, unique-marker-bb22.";
  const result = await analyzeContract(maskedText, "credit_card", "ar", {
    provider: fakeGemini,
    fallbackProvider: fakeOpenRouter,
  });

  assert.equal(geminiCalls, 1, "Gemini must be attempted once before falling back");
  assert.ok(capturedPrompt, "OpenRouter must have been called");
  assert.ok(
    capturedPrompt!.includes(maskedText),
    "OpenRouter must receive the same maskedText",
  );
  assert.ok(
    capturedPrompt!.includes('"credit_card"'),
    "OpenRouter must receive the same contractType",
  );
  assert.ok(
    /in Arabic/i.test(capturedPrompt!),
    "OpenRouter must receive the same analysisLanguage instruction",
  );
  assert.equal(result.contractType, "credit_card", "a valid OpenRouter result must be returned");

  console.log("PASS testRateLimitedTriggersFallbackWithSameInputs");
}

async function testSchemaValidationFailureDoesNotFallback(): Promise<void> {
  let geminiCalls = 0;
  let openRouterCalls = 0;

  const fakeGemini: ContractAnalysisProvider = {
    async generate() {
      geminiCalls += 1;
      // Always invalid (missing every required field) on both the initial
      // and correction attempt, so the primary provider itself exhausts
      // its attempts and throws SCHEMA_VALIDATION_FAILED.
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
    await analyzeContract("masked text, unique-marker-cc33.", "credit_card", "ar", {
      provider: fakeGemini,
      fallbackProvider: fakeOpenRouter,
    });
  } catch (err) {
    thrown = err;
  }

  assert.equal(geminiCalls, 2, "Gemini must exhaust its initial + correction attempts");
  assert.equal(openRouterCalls, 0, "OpenRouter must not be called for SCHEMA_VALIDATION_FAILED");
  assert.ok(
    thrown instanceof ContractAnalysisError && thrown.code === "SCHEMA_VALIDATION_FAILED",
    "the schema validation error must propagate unchanged",
  );

  console.log("PASS testSchemaValidationFailureDoesNotFallback");
}

async function testMissingOpenRouterKeyIsDeterministicAndSafe(): Promise<void> {
  const fakeGemini: ContractAnalysisProvider = {
    async generate() {
      throw rateLimitedError();
    },
  };

  const originalKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  let thrown: unknown;
  try {
    // No fallbackProvider override — exercises the real default
    // openRouterContractAnalysisProvider, which must refuse to run (and
    // must not attempt any network call) without OPENROUTER_API_KEY.
    await analyzeContract("masked text, unique-marker-dd44.", "credit_card", "ar", {
      provider: fakeGemini,
    });
  } catch (err) {
    thrown = err;
  } finally {
    if (originalKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalKey;
    }
  }

  assert.ok(
    thrown instanceof ContractAnalysisError && thrown.code === "MISSING_OPENROUTER_API_KEY",
    "a missing OPENROUTER_API_KEY during a RATE_LIMITED fallback must throw a specific, deterministic error",
  );
  assert.ok(
    thrown instanceof Error && !thrown.message.includes("Bearer"),
    "the error message must never contain or resemble an API key value",
  );

  console.log("PASS testMissingOpenRouterKeyIsDeterministicAndSafe");
}

export async function run(): Promise<void> {
  await testGeminiSuccessSkipsFallback();
  await testRateLimitedTriggersFallbackWithSameInputs();
  await testSchemaValidationFailureDoesNotFallback();
  await testMissingOpenRouterKeyIsDeterministicAndSafe();

  console.log("PASS service.providerFallback.test.ts");
}

run();
