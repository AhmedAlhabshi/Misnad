import assert from "node:assert/strict";
import { analyzeContract } from "../service";
import type {
  ContractAnalysisProvider,
  ContractAnalysisProviderRequest,
} from "../providers/types";

const MASKED_TEXT_MARKER = "MISNAD_MASKED_TEXT_MARKER_12345";

export async function run(): Promise<void> {
  const maskedText = `Masked lease contract body with [NATIONAL_ID] placeholder, ${MASKED_TEXT_MARKER}.`;

  let callCount = 0;
  const capturedPrompts: string[] = [];

  const fakeProvider: ContractAnalysisProvider = {
    async generate(request: ContractAnalysisProviderRequest) {
      callCount += 1;
      capturedPrompts.push(request.userPrompt);

      if (callCount === 1) {
        // Deliberately invalid (missing every required field) so the
        // service falls through to the correction/retry attempt — this is
        // exactly the path that previously dropped the masked contract text.
        return { rawText: JSON.stringify({}) };
      }

      return {
        rawText: JSON.stringify({
          contractType: "other",
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
          typeDetails: { contractType: "other", description: null },
        }),
      };
    },
  };

  const result = await analyzeContract(maskedText, "other", "ar", {
    provider: fakeProvider,
  });

  assert.equal(callCount, 2, "the correction/retry attempt must have been exercised");

  const [firstPrompt, correctionPrompt] = capturedPrompts;

  assert.ok(
    firstPrompt.includes(MASKED_TEXT_MARKER),
    "the first-attempt prompt must contain the masked text marker",
  );
  assert.ok(
    correctionPrompt.includes(MASKED_TEXT_MARKER),
    "the correction/retry prompt must also contain the masked text marker — this is the exact request that previously omitted it and caused Gemini to report no contract text was provided",
  );

  assert.equal(result.contractType, "other");

  console.log("PASS service.correctionPromptIncludesMaskedText.test.ts");
}

run();
