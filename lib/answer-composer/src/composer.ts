import { z } from "zod/v4";
import { toGeminiJsonSchema } from "@workspace/contract-schema";
import { groundedContextSchema, type GroundedContext } from "@workspace/context-builder";
import {
  ContractAnalysisError,
  geminiContractAnalysisProvider,
  openRouterContractAnalysisProvider,
  type ContractAnalysisProvider,
  type ProviderResponseDiagnostics,
} from "@workspace/contract-analysis";
import { buildAnswerCorrectionPrompt, buildAnswerPrompt } from "./answerPrompt";
import { composerSchemaValidationFailedError, invalidGroundedContextError } from "./errors";
import { sanitizeComposerResponse } from "./responseSanitizer";
import { llmComposerResponseSchema, type ComposedAnswer, type LlmComposerResponse } from "./schema";
import { buildSystemInstructions } from "./systemPrompt";

const LLM_RESPONSE_JSON_SCHEMA = toGeminiJsonSchema(llmComposerResponseSchema);

export interface ComposeAnswerOptions {
  /** Defaults to the real Gemini provider. Inject a mock in tests. */
  provider?: ContractAnalysisProvider;
  /** Label reported in the final answer's `provider` field. Defaults to "gemini" when `provider` is omitted, otherwise "custom". */
  providerName?: string;
  /** Used only when the primary provider fails with RATE_LIMITED — defaults to the real OpenRouter provider. */
  fallbackProvider?: ContractAnalysisProvider;
  fallbackProviderName?: string;
}

/**
 * Generates a safe, evidence-grounded answer from an already-validated
 * `GroundedContext`. Never retrieves anything itself — every piece of
 * evidence it can possibly cite already exists in `context`. Mirrors
 * `@workspace/contract-analysis`'s own initial-attempt +
 * one-correction-attempt + RATE_LIMITED-triggered provider-fallback shape
 * exactly (see `personalizedAnalysisService.ts`), reusing the exact same
 * provider implementations rather than a new HTTP client.
 *
 * Throws `ComposerError` (`SCHEMA_VALIDATION_FAILED` or
 * `INVALID_GROUNDED_CONTEXT`) for composer-specific failures, or lets
 * `@workspace/contract-analysis`'s own `ContractAnalysisError` propagate
 * unchanged for a genuine provider failure (missing API key, non-rate-limit
 * provider error, no usable response) — neither ever includes an API key
 * or raw provider payload (see the underlying providers' own error
 * handling, reused unchanged here).
 */
export async function composeAnswer(context: GroundedContext, options: ComposeAnswerOptions = {}): Promise<ComposedAnswer> {
  const parsedContext = groundedContextSchema.safeParse(context);
  if (!parsedContext.success) {
    throw invalidGroundedContextError();
  }
  const validContext = parsedContext.data;

  const primaryProvider = options.provider ?? geminiContractAnalysisProvider;
  const primaryProviderName = options.providerName ?? (options.provider ? "custom" : "gemini");

  try {
    return await runComposerAttempts(primaryProvider, primaryProviderName, validContext);
  } catch (error) {
    if (!(error instanceof ContractAnalysisError) || error.code !== "RATE_LIMITED") {
      throw error;
    }

    const fallbackProvider = options.fallbackProvider ?? openRouterContractAnalysisProvider;
    const fallbackProviderName = options.fallbackProviderName ?? (options.fallbackProvider ? "custom" : "openrouter");

    console.error("[MISNAD_DIAGNOSTIC]", {
      event: "provider_fallback",
      from: primaryProviderName,
      to: fallbackProviderName,
      reason: "RATE_LIMITED",
      context: "answerComposer",
    });

    return await runComposerAttempts(fallbackProvider, fallbackProviderName, validContext);
  }
}

async function runComposerAttempts(
  provider: ContractAnalysisProvider,
  providerName: string,
  context: GroundedContext,
): Promise<ComposedAnswer> {
  const systemInstructions = buildSystemInstructions({ language: context.language, route: context.route });

  const firstResponse = await provider.generate({
    systemInstructions,
    userPrompt: buildAnswerPrompt(context),
    jsonSchema: LLM_RESPONSE_JSON_SCHEMA,
    context: "answerComposer",
  });

  const firstAttempt = tryValidateLlmResponse(firstResponse.rawText);
  if (firstAttempt.success) {
    return sanitizeComposerResponse(firstAttempt.data, context, providerName);
  }
  logValidationDiagnostic("initial", firstResponse.rawText, firstResponse.diagnostics, firstAttempt.errorSummary);

  const correctionResponse = await provider.generate({
    systemInstructions,
    userPrompt: buildAnswerCorrectionPrompt({
      context,
      previousResponseText: firstResponse.rawText,
      validationErrorSummary: firstAttempt.errorSummary,
    }),
    jsonSchema: LLM_RESPONSE_JSON_SCHEMA,
    context: "answerComposer",
  });

  const secondAttempt = tryValidateLlmResponse(correctionResponse.rawText);
  if (secondAttempt.success) {
    return sanitizeComposerResponse(secondAttempt.data, context, providerName);
  }
  logValidationDiagnostic("correction", correctionResponse.rawText, correctionResponse.diagnostics, secondAttempt.errorSummary);

  throw composerSchemaValidationFailedError();
}

function stripCodeFences(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fencedMatch ? fencedMatch[1] : text;
}

type ValidationAttempt = { success: true; data: LlmComposerResponse } | { success: false; errorSummary: string };

function tryValidateLlmResponse(rawText: string): ValidationAttempt {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { success: false, errorSummary: "The response was empty." };
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(stripCodeFences(trimmed));
  } catch {
    return { success: false, errorSummary: "The response was not valid JSON." };
  }

  const result = llmComposerResponseSchema.safeParse(candidate);
  if (!result.success) {
    return { success: false, errorSummary: summarizeZodError(result.error) };
  }
  return { success: true, data: result.data };
}

const MAX_ISSUES_IN_SUMMARY = 10;

function summarizeZodError(error: z.ZodError): string {
  const issues = error.issues.slice(0, MAX_ISSUES_IN_SUMMARY).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `- ${path}: ${issue.message}`;
  });

  const suffix = error.issues.length > MAX_ISSUES_IN_SUMMARY ? `\n...and ${error.issues.length - MAX_ISSUES_IN_SUMMARY} more issue(s).` : "";

  return `${issues.join("\n")}${suffix}`;
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
    context: "answerComposer",
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
