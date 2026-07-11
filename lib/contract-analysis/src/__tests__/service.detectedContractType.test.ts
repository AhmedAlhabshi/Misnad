import assert from "node:assert/strict";
import { analyzeContract } from "../service";
import type {
  ContractAnalysisProvider,
  ContractAnalysisProviderRequest,
} from "../providers/types";

export async function run(): Promise<void> {
  const maskedText =
    "Masked credit card agreement body with [NATIONAL_ID] placeholder, unique-marker-9c71fa.";

  const fakeProvider: ContractAnalysisProvider = {
    async generate(_request: ContractAnalysisProviderRequest) {
      return {
        rawText: JSON.stringify({
          contractType: "credit_card",
          // Independently "detected" as a different type than the
          // user-selected one — proves detection is not just an echo.
          detectedContractType: "auto_finance",
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

  const result = await analyzeContract(maskedText, "credit_card", {
    provider: fakeProvider,
  });

  assert.equal(
    result.contractType,
    "credit_card",
    "analysis.contractType must keep following the user-selected contract type",
  );
  assert.equal(
    result.detectedContractType,
    "auto_finance",
    "detectedContractType must independently carry the model's own classification, even when it differs from contractType",
  );
  assert.equal(
    result.typeDetails.contractType,
    "credit_card",
    "typeDetails must stay tied to the user-selected contract type",
  );
  assert.ok(
    "creditLimit" in result.typeDetails,
    "typeDetails must remain the credit_card variant (e.g. exposes creditLimit)",
  );

  console.log("PASS service.detectedContractType.test.ts");
}

run();
