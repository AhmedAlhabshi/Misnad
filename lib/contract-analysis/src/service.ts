import {
  isAnalysisLanguage,
  isContractType,
  type AnalysisLanguage,
  type ContractType,
} from "@workspace/contract-types";
import {
  getContractUnderstandingJsonSchemaFor,
  type ContractUnderstanding,
} from "@workspace/contract-schema";
import {
  ContractAnalysisError,
  emptyMaskedTextError,
  invalidAnalysisLanguageError,
  invalidContractTypeError,
  schemaValidationFailedError,
} from "./errors";
import { buildAnalysisPrompt, buildCorrectionPrompt, SYSTEM_INSTRUCTIONS } from "./promptBuilder";
import { parseJsonResponse, validateContractUnderstanding } from "./validate";
import type { ContractAnalysisProvider, ProviderResponseDiagnostics } from "./providers/types";
import { geminiContractAnalysisProvider } from "./providers/geminiProvider";
import { openRouterContractAnalysisProvider } from "./providers/openRouterProvider";

const MAX_ATTEMPTS = 2;

export interface AnalyzeContractOptions {
  provider?: ContractAnalysisProvider;
  /** Used only when the primary provider fails with RATE_LIMITED. */
  fallbackProvider?: ContractAnalysisProvider;
}

export async function analyzeContract(
  maskedText: string,
  contractType: ContractType,
  analysisLanguage: AnalysisLanguage,
  options: AnalyzeContractOptions = {},
): Promise<ContractUnderstanding> {
  if (typeof maskedText !== "string" || maskedText.trim().length === 0) {
    throw emptyMaskedTextError();
  }

  if (!isContractType(contractType)) {
    throw invalidContractTypeError();
  }

  if (!isAnalysisLanguage(analysisLanguage)) {
    throw invalidAnalysisLanguageError();
  }

  const primaryProvider = options.provider ?? geminiContractAnalysisProvider;
  const jsonSchema = getContractUnderstandingJsonSchemaFor(contractType);

  try {
    return await runAnalysisAttempts(
      primaryProvider,
      maskedText,
      contractType,
      analysisLanguage,
      jsonSchema,
    );
  } catch (error) {
    if (!(error instanceof ContractAnalysisError) || error.code !== "RATE_LIMITED") {
      throw error;
    }

    // Gemini (or whichever primary provider was used) is rate/quota limited
    // specifically — and only for that reason — retry the complete analysis
    // (both the initial and correction attempt) against the OpenRouter
    // fallback. Any other failure (schema validation, bad input, etc.) is
    // rethrown above and never reaches this fallback.
    const fallbackProvider = options.fallbackProvider ?? openRouterContractAnalysisProvider;

    console.error("[MISNAD_DIAGNOSTIC]", {
      event: "provider_fallback",
      from: "gemini",
      to: "openrouter",
      reason: "RATE_LIMITED",
    });

    return await runAnalysisAttempts(
      fallbackProvider,
      maskedText,
      contractType,
      analysisLanguage,
      jsonSchema,
    );
  }
}

/**
 * Runs the full initial-attempt + one-correction-attempt analysis flow
 * against a single provider. Shared by both the primary (Gemini) and
 * fallback (OpenRouter) providers so both get identical prompt building,
 * validation, and diagnostic-logging behavior.
 */
async function runAnalysisAttempts(
  provider: ContractAnalysisProvider,
  maskedText: string,
  contractType: ContractType,
  analysisLanguage: AnalysisLanguage,
  jsonSchema: unknown,
): Promise<ContractUnderstanding> {
  const firstResponse = await provider.generate({
    systemInstructions: SYSTEM_INSTRUCTIONS,
    userPrompt: buildAnalysisPrompt(maskedText, contractType, analysisLanguage),
    jsonSchema,
  });

  const firstAttempt = tryValidate(firstResponse.rawText, maskedText);

  if (firstAttempt.success && firstAttempt.data) {
    return firstAttempt.data;
  }

  logValidationDiagnostic(
    "initial",
    firstResponse.rawText,
    firstResponse.diagnostics,
    firstAttempt.errorSummary ?? "The response was not valid JSON.",
  );

  const correctionResponse = await provider.generate({
    systemInstructions: SYSTEM_INSTRUCTIONS,
    userPrompt: buildCorrectionPrompt({
      maskedText,
      contractType,
      analysisLanguage,
      previousResponseText: firstResponse.rawText,
      validationErrorSummary:
        firstAttempt.errorSummary ?? "The response was not valid JSON.",
    }),
    jsonSchema,
  });

  const secondAttempt = tryValidate(correctionResponse.rawText, maskedText);

  if (secondAttempt.success && secondAttempt.data) {
    return secondAttempt.data;
  }

  logValidationDiagnostic(
    "correction",
    correctionResponse.rawText,
    correctionResponse.diagnostics,
    secondAttempt.errorSummary ?? "The response was not valid JSON.",
  );

  throw schemaValidationFailedError();
}

const DIAGNOSTIC_PREVIEW_CHARS = 300;

/**
 * TEMPORARY development-only diagnostic for the current investigation into
 * why structured-output validation is failing on large real contracts.
 * Never logs maskedText, raw PDF text, or the full AI response — only
 * metadata about it and short previews of the AI-generated JSON output.
 */
function logValidationDiagnostic(
  attempt: "initial" | "correction",
  rawText: string,
  diagnostics: ProviderResponseDiagnostics | undefined,
  validationErrorSummary: string,
): void {
  const trimmed = rawText.trim();

  console.error("[MISNAD_DIAGNOSTIC]", {
    attempt,
    validationErrorSummary,
    rawTextLength: diagnostics?.rawTextLength ?? rawText.length,
    finishReason: diagnostics?.finishReason,
    promptTokenCount: diagnostics?.promptTokenCount,
    candidatesTokenCount: diagnostics?.candidatesTokenCount,
    totalTokenCount: diagnostics?.totalTokenCount,
    endsWithCompleteJsonObject: trimmed.endsWith("}"),
    responsePreview: {
      start: trimmed.slice(0, DIAGNOSTIC_PREVIEW_CHARS),
      end: trimmed.slice(-DIAGNOSTIC_PREVIEW_CHARS),
    },
  });
}

function tryValidate(
  rawText: string,
  maskedText: string,
): {
  success: boolean;
  data?: ContractUnderstanding;
  errorSummary?: string;
} {
  try {
    const candidate = parseJsonResponse(rawText);
    return validateContractUnderstanding(candidate, maskedText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parsing error";
    return { success: false, errorSummary: message };
  }
}

export const __TOTAL_ANALYSIS_ATTEMPTS = MAX_ATTEMPTS;
