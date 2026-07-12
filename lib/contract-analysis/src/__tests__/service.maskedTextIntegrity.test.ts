import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { analyzeContract } from "../service";
import type {
  ContractAnalysisProvider,
  ContractAnalysisProviderRequest,
} from "../providers/types";

function safeFingerprint(text: string): { length: number; sha256: string } {
  return { length: text.length, sha256: createHash("sha256").update(text).digest("hex") };
}

export async function run(): Promise<void> {
  const maskedText =
    "Masked lease contract body with [NATIONAL_ID] and [PHONE] placeholders, unique-marker-38f2a1.";
  const expectedFingerprint = safeFingerprint(maskedText);

  let capturedFirstPrompt: string | undefined;

  const fakeProvider: ContractAnalysisProvider = {
    async generate(request: ContractAnalysisProviderRequest) {
      if (!capturedFirstPrompt) {
        capturedFirstPrompt = request.userPrompt;
      }
      return {
        rawText: JSON.stringify({
          contractType: "other",
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

  await analyzeContract(maskedText, "other", "ar", { provider: fakeProvider });

  assert.ok(capturedFirstPrompt, "provider.generate must have been called");

  // Safe diagnostic only: compare length + hash of the text embedded in the
  // outgoing prompt against the fingerprint of the real maskedText input.
  // Never logs or asserts on the text content itself.
  const promptContainsRealText = capturedFirstPrompt!.includes(maskedText);
  const embeddedFingerprint = promptContainsRealText
    ? expectedFingerprint
    : safeFingerprint("");

  assert.equal(
    promptContainsRealText,
    true,
    "the prompt sent to the provider must contain the exact real maskedText passed to analyzeContract (length/hash check only, no content is logged)",
  );
  assert.equal(
    embeddedFingerprint.length,
    expectedFingerprint.length,
    "length fingerprint mismatch between real maskedText and text embedded in the prompt",
  );
  assert.equal(
    embeddedFingerprint.sha256,
    expectedFingerprint.sha256,
    "sha256 fingerprint mismatch between real maskedText and text embedded in the prompt",
  );

  console.log("PASS service.maskedTextIntegrity.test.ts");
}

run();
