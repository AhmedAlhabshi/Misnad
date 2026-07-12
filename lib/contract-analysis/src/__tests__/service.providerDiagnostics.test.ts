import assert from "node:assert/strict";
import { analyzeContract } from "../service";
import { ContractAnalysisError } from "../errors";
import type {
  ContractAnalysisProvider,
  ContractAnalysisProviderRequest,
} from "../providers/types";

export async function run(): Promise<void> {
  const maskedText = "Masked other contract body, unique-marker-4d21ab.";

  let callCount = 0;
  const fakeProvider: ContractAnalysisProvider = {
    async generate(_request: ContractAnalysisProviderRequest) {
      callCount += 1;

      if (callCount === 1) {
        // Deliberately invalid (missing every required field) so the
        // service falls through to the correction attempt, exercising the
        // diagnostic-logging path. Diagnostics simulate a MAX_TOKENS cutoff.
        return {
          rawText: JSON.stringify({}),
          diagnostics: {
            finishReason: "MAX_TOKENS",
            promptTokenCount: 15000,
            candidatesTokenCount: 8192,
            totalTokenCount: 23192,
            rawTextLength: 2,
          },
        };
      }

      // Second call: a provider that does NOT supply diagnostics at all —
      // logging must tolerate this without crashing.
      return { rawText: JSON.stringify({}) };
    },
  };

  const originalConsoleError = console.error;
  const capturedLogs: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    capturedLogs.push(args);
  };

  let thrown: unknown;
  try {
    await analyzeContract(maskedText, "other", "ar", { provider: fakeProvider });
  } catch (err) {
    thrown = err;
  } finally {
    console.error = originalConsoleError;
  }

  assert.ok(
    thrown instanceof ContractAnalysisError && thrown.code === "SCHEMA_VALIDATION_FAILED",
    "analyzeContract must still throw the same public schema-validation error regardless of whether provider diagnostics are present",
  );
  assert.equal(callCount, 2, "both the initial and correction attempts must have been exercised");

  assert.equal(
    capturedLogs.length,
    2,
    "a diagnostic log must be emitted for both the failed initial attempt and the failed correction attempt",
  );

  const [initialLogArgs, correctionLogArgs] = capturedLogs;

  assert.equal(initialLogArgs[0], "[MISNAD_DIAGNOSTIC]", "diagnostic logs must be clearly labeled");
  const initialPayload = initialLogArgs[1] as Record<string, unknown>;
  assert.equal(initialPayload.attempt, "initial");
  assert.equal(initialPayload.finishReason, "MAX_TOKENS");
  assert.equal(initialPayload.promptTokenCount, 15000);
  assert.equal(initialPayload.rawTextLength, 2);
  assert.equal(initialPayload.endsWithCompleteJsonObject, true);

  assert.equal(correctionLogArgs[0], "[MISNAD_DIAGNOSTIC]");
  const correctionPayload = correctionLogArgs[1] as Record<string, unknown>;
  assert.equal(correctionPayload.attempt, "correction");
  assert.equal(
    correctionPayload.finishReason,
    undefined,
    "a provider response with no diagnostics must not crash logging — the fields are simply absent",
  );

  console.log("PASS service.providerDiagnostics.test.ts");
}

run();
