import assert from "node:assert/strict";
import { analyzeContract } from "../service";
import type {
  ContractAnalysisProvider,
  ContractAnalysisProviderRequest,
} from "../providers/types";

export async function run(): Promise<void> {
  const maskedText = "Masked credit card agreement body, unique-marker-4f18ea.";

  let callCount = 0;
  let capturedPrompt: string | undefined;

  const fakeProvider: ContractAnalysisProvider = {
    async generate(request: ContractAnalysisProviderRequest) {
      callCount += 1;
      capturedPrompt = request.userPrompt;
      return {
        rawText: JSON.stringify({
          contractType: "credit_card",
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
        }),
      };
    },
  };

  const result = await analyzeContract(maskedText, "credit_card", "ar", {
    provider: fakeProvider,
  });

  assert.equal(
    callCount,
    1,
    "a valid first-attempt result must not trigger any extra call (e.g. an independent detection call)",
  );

  assert.ok(
    capturedPrompt!.includes('"credit_card"'),
    "the prompt sent to the provider must use the user-selected contract type",
  );
  assert.equal(
    /detectedContractType/i.test(capturedPrompt!),
    false,
    "the prompt must not mention detectedContractType or independent classification",
  );
  assert.equal(
    /independently classify/i.test(capturedPrompt!),
    false,
    "the prompt must not instruct the model to independently classify the contract type",
  );

  assert.equal(
    result.contractType,
    "credit_card",
    "analysis.contractType must follow the user-selected contract type",
  );
  assert.equal(
    result.typeDetails.contractType,
    "credit_card",
    "typeDetails must match the user-selected contract type variant",
  );
  assert.ok(
    "creditLimit" in result.typeDetails,
    "typeDetails must be the credit_card variant",
  );
  assert.equal(
    "detectedContractType" in result,
    false,
    "the result must not contain a detectedContractType field",
  );

  console.log("PASS service.userSelectedContractTypeOnly.test.ts");
}

run();
