import { z } from "zod/v4";
import { toGeminiJsonSchema } from "@workspace/contract-schema";
import { ContractAnalysisError, schemaValidationFailedError } from "./errors";
import { parseJsonResponse } from "./validate";
import {
  buildPersonalizedAnalysisCorrectionPrompt,
  buildPersonalizedAnalysisPrompt,
  PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS,
} from "./personalizedAnalysisPrompt";
import {
  personalizedAnalysisResponseSchema,
  type PersonalizedAnalysisRequest,
  type PersonalizedAnalysisResponse,
} from "./personalizedAnalysisSchema";
import type { ContractAnalysisProvider, ProviderResponseDiagnostics } from "./providers/types";
import { geminiContractAnalysisProvider } from "./providers/geminiProvider";
import { openRouterContractAnalysisProvider } from "./providers/openRouterProvider";

const RESPONSE_JSON_SCHEMA = toGeminiJsonSchema(personalizedAnalysisResponseSchema);

export interface AnalyzePersonalizedFinancialImpactOptions {
  provider?: ContractAnalysisProvider;
  /** Used only when the primary provider fails with RATE_LIMITED. */
  fallbackProvider?: ContractAnalysisProvider;
}

/**
 * Generates the 3-section personalized financial analysis (pressure points /
 * positive factors / discussion points) from an already-validated,
 * already-sanitized request payload — the caller (the API route) is
 * responsible for validating the raw request body against
 * `personalizedAnalysisRequestSchema` first.
 *
 * This deliberately mirrors `service.ts`'s initial-attempt +
 * one-correction-attempt + RATE_LIMITED-triggered provider-fallback shape as
 * a separate, self-contained function rather than generalizing
 * `runAnalysisAttempts` to cover both — this avoids any risk to the
 * existing, well-tested contract-understanding flow. It reuses the exact
 * same provider implementations (Gemini primary, OpenRouter fallback) and
 * error-code conventions.
 */
export async function analyzePersonalizedFinancialImpact(
  request: PersonalizedAnalysisRequest,
  options: AnalyzePersonalizedFinancialImpactOptions = {},
): Promise<PersonalizedAnalysisResponse> {
  const primaryProvider = options.provider ?? geminiContractAnalysisProvider;

  try {
    return await runPersonalizedAnalysisAttempts(primaryProvider, request);
  } catch (error) {
    if (!(error instanceof ContractAnalysisError) || error.code !== "RATE_LIMITED") {
      throw error;
    }

    const fallbackProvider = options.fallbackProvider ?? openRouterContractAnalysisProvider;

    console.error("[MISNAD_DIAGNOSTIC]", {
      event: "provider_fallback",
      from: "gemini",
      to: "openrouter",
      reason: "RATE_LIMITED",
      context: "personalizedAnalysis",
    });

    return await runPersonalizedAnalysisAttempts(fallbackProvider, request);
  }
}

async function runPersonalizedAnalysisAttempts(
  provider: ContractAnalysisProvider,
  request: PersonalizedAnalysisRequest,
): Promise<PersonalizedAnalysisResponse> {
  const firstResponse = await provider.generate({
    systemInstructions: PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS,
    userPrompt: buildPersonalizedAnalysisPrompt(request),
    jsonSchema: RESPONSE_JSON_SCHEMA,
    context: "personalizedAnalysis",
  });

  const firstAttempt = tryValidate(firstResponse.rawText);
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
    systemInstructions: PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS,
    userPrompt: buildPersonalizedAnalysisCorrectionPrompt({
      request,
      previousResponseText: firstResponse.rawText,
      validationErrorSummary: firstAttempt.errorSummary ?? "The response was not valid JSON.",
    }),
    jsonSchema: RESPONSE_JSON_SCHEMA,
    context: "personalizedAnalysis",
  });

  const secondAttempt = tryValidate(correctionResponse.rawText);
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

function logValidationDiagnostic(
  attempt: "initial" | "correction",
  rawText: string,
  diagnostics: ProviderResponseDiagnostics | undefined,
  validationErrorSummary: string,
): void {
  const trimmed = rawText.trim();

  console.error("[MISNAD_DIAGNOSTIC]", {
    context: "personalizedAnalysis",
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

function tryValidate(rawText: string): {
  success: boolean;
  data?: PersonalizedAnalysisResponse;
  errorSummary?: string;
} {
  try {
    const candidate = parseJsonResponse(rawText);
    const result = personalizedAnalysisResponseSchema.safeParse(candidate);
    if (!result.success) {
      return { success: false, errorSummary: summarizeZodError(result.error) };
    }
    return { success: true, data: result.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parsing error";
    return { success: false, errorSummary: message };
  }
}

const MAX_ISSUES_IN_SUMMARY = 10;

function summarizeZodError(error: z.ZodError): string {
  const issues = error.issues.slice(0, MAX_ISSUES_IN_SUMMARY).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `- ${path}: ${issue.message}`;
  });

  const suffix =
    error.issues.length > MAX_ISSUES_IN_SUMMARY
      ? `\n...and ${error.issues.length - MAX_ISSUES_IN_SUMMARY} more issue(s).`
      : "";

  return `${issues.join("\n")}${suffix}`;
}
