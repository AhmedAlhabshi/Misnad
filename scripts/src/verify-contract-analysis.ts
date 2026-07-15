import { analyzeContract, ContractAnalysisError } from "@workspace/contract-analysis";
import type {
  ContractAnalysisProvider,
  ContractAnalysisProviderRequest,
  ContractAnalysisProviderResponse,
} from "@workspace/contract-analysis";
import type { ContractType } from "@workspace/contract-types";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    fail(message);
  }
}

const VALID_UNDERSTANDING = {
  contractType: "lease" as const,
  contractSummary: "Contract summary.",
  contractSummarySimple: "Simple contract summary.",
  parties: [{ role: "tenant", name: null, identifier: null, notes: null }],
  financialObligations: [],
  dates: [],
  penalties: [],
  fees: [],
  importantClauses: [],
  extractedNumbers: [],
  missingInformation: [],
  extractionNotes: null,
  typeDetails: {
    contractType: "lease" as const,
    propertyAddress: null,
    monthlyRent: 1500,
    securityDeposit: null,
    leaseTermMonths: 12,
    renewalTerms: null,
    utilitiesIncluded: null,
  },
};

function makeMockProvider(
  responses: string[],
): { provider: ContractAnalysisProvider; callCount: () => number } {
  let index = 0;
  const provider: ContractAnalysisProvider = {
    async generate(
      _request: ContractAnalysisProviderRequest,
    ): Promise<ContractAnalysisProviderResponse> {
      const rawText = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return { rawText };
    },
  };
  return { provider, callCount: () => index };
}

async function testSuccessOnFirstAttempt(): Promise<void> {
  const { provider, callCount } = makeMockProvider([
    JSON.stringify(VALID_UNDERSTANDING),
  ]);

  const result = await analyzeContract("Sample masked lease text", "lease", {
    provider,
  });

  assert(result.contractType === "lease", "expected contractType to be lease");
  assert(callCount() === 1, "expected exactly 1 provider call on first-attempt success");
}

async function testSuccessAfterCorrection(): Promise<void> {
  const { provider, callCount } = makeMockProvider([
    "not valid json {{{",
    JSON.stringify(VALID_UNDERSTANDING),
  ]);

  const result = await analyzeContract("Sample masked lease text", "lease", {
    provider,
  });

  assert(result.contractType === "lease", "expected contractType to be lease after correction");
  assert(callCount() === 2, "expected exactly 2 provider calls for correction success");
}

async function testBothAttemptsFail(): Promise<void> {
  const { provider, callCount } = makeMockProvider([
    "not valid json {{{",
    "still not valid json {{{",
  ]);

  try {
    await analyzeContract("Sample masked lease text", "lease", { provider });
    fail("expected analyzeContract to throw when both attempts fail");
  } catch (error) {
    assert(
      error instanceof ContractAnalysisError && error.code === "SCHEMA_VALIDATION_FAILED",
      "expected SCHEMA_VALIDATION_FAILED error after both attempts fail",
    );
  }
  assert(callCount() === 2, "expected exactly 2 provider calls when both attempts fail");
}

async function testEmptyMaskedText(): Promise<void> {
  const { provider, callCount } = makeMockProvider([JSON.stringify(VALID_UNDERSTANDING)]);

  try {
    await analyzeContract("   ", "lease", { provider });
    fail("expected analyzeContract to throw for empty maskedText");
  } catch (error) {
    assert(
      error instanceof ContractAnalysisError && error.code === "EMPTY_MASKED_TEXT",
      "expected EMPTY_MASKED_TEXT error",
    );
  }
  assert(callCount() === 0, "expected no provider calls for empty maskedText");
}

async function testInvalidContractType(): Promise<void> {
  const { provider, callCount } = makeMockProvider([JSON.stringify(VALID_UNDERSTANDING)]);

  try {
    await analyzeContract(
      "Sample masked text",
      "not_a_real_type" as unknown as ContractType,
      { provider },
    );
    fail("expected analyzeContract to throw for invalid contractType");
  } catch (error) {
    assert(
      error instanceof ContractAnalysisError && error.code === "INVALID_CONTRACT_TYPE",
      "expected INVALID_CONTRACT_TYPE error",
    );
  }
  assert(callCount() === 0, "expected no provider calls for invalid contractType");
}

async function testMissingApiKeyAtCallTime(): Promise<void> {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const { geminiContractAnalysisProvider } = await import(
      "@workspace/contract-analysis"
    );

    try {
      await analyzeContract("Sample masked text", "lease", {
        provider: geminiContractAnalysisProvider,
      });
      fail("expected analyzeContract to throw when GEMINI_API_KEY is missing");
    } catch (error) {
      assert(
        error instanceof ContractAnalysisError && error.code === "MISSING_API_KEY",
        "expected MISSING_API_KEY error when calling the real Gemini provider without a key",
      );
    }
  } finally {
    if (previousKey !== undefined) {
      process.env.GEMINI_API_KEY = previousKey;
    }
  }
}

async function main(): Promise<void> {
  await testSuccessOnFirstAttempt();
  await testSuccessAfterCorrection();
  await testBothAttemptsFail();
  await testEmptyMaskedText();
  await testInvalidContractType();
  await testMissingApiKeyAtCallTime();

  console.log("OK: contract-analysis verification passed");
  console.log("  - success on first attempt");
  console.log("  - success after one correction attempt");
  console.log("  - failure after both attempts");
  console.log("  - empty maskedText rejected");
  console.log("  - invalid contractType rejected");
  console.log("  - missing GEMINI_API_KEY only errors at call time (no real request sent)");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
