import { GoogleGenAI } from "@google/genai";
import {
  missingApiKeyError,
  noUsableResponseError,
  providerRequestFailedError,
  rateLimitedError,
} from "../errors";
import type {
  ContractAnalysisProvider,
  ContractAnalysisProviderRequest,
  ContractAnalysisProviderResponse,
} from "./types";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

// gemini-2.5-flash's documented output token limit is 65,536 (verified live
// against ai.google.dev/gemini-api/docs/models/gemini-2.5-flash). Kept as a
// named constant so the diagnostic below can report the same value actually
// configured on the request, without duplicating the literal.
const GEMINI_MAX_OUTPUT_TOKENS = 65536;

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw missingApiKeyError();
  }

  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }

  return cachedClient;
}

function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

function isRateLimitLikeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate.?limit|quota|resource_exhausted/i.test(message);
}

function isTimeoutOrNetworkLikeError(error: unknown, code: string | undefined): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out|network|fetch failed/i.test(message)) {
    return true;
  }
  return typeof code === "string" && /^(ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN)$/i.test(code);
}

/** The Gemini SDK's `ApiError` exposes a numeric `status` (HTTP status code). */
function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/**
 * Looks for a provider/network error code (e.g. Node's `ECONNRESET` on a raw
 * connection failure), checking both the error itself and a nested `.cause`
 * (as Node's fetch wraps low-level connection errors in a `TypeError` with a
 * `.cause`).
 */
function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;

  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string") return direct;

  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === "string") return causeCode;
  }

  return undefined;
}

const GEMINI_ERROR_MESSAGE_PREVIEW_CHARS = 300;

/**
 * TEMPORARY development-only diagnostic exposing why a raw Gemini
 * request/connection failure occurred, logged immediately before the
 * original error is converted into the generic PROVIDER_REQUEST_FAILED
 * error (which otherwise discards all of this detail — the route only ever
 * sees a static "The AI provider rejected the analysis request." message).
 *
 * Never logs the API key, request headers, the prompt/contract text, the
 * full provider response, or a stack trace — only a truncated error message
 * and safe metadata about the failure shape.
 */
export function logGeminiRequestErrorDiagnostic(error: unknown, model: string): void {
  try {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const errorCode = extractErrorCode(error);

    console.error("[MISNAD_DIAGNOSTIC]", {
      event: "gemini_request_error",
      provider: "gemini",
      model,
      errorName: error instanceof Error ? error.name : typeof error,
      statusCode: extractStatusCode(error),
      providerErrorCode: errorCode,
      errorMessage: rawMessage.slice(0, GEMINI_ERROR_MESSAGE_PREVIEW_CHARS),
      looksRateLimited: isRateLimitLikeError(error),
      looksTimeoutOrNetwork: isTimeoutOrNetworkLikeError(error, errorCode),
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    });
  } catch {
    // Diagnostics must never interfere with the real error path.
  }
}

/**
 * Gemini's structured-output validator can reject an otherwise-valid JSON
 * Schema with an HTTP 400 ("The specified schema produces a constraint that
 * has too many states for serving") when it contains long/nested array or
 * string length constraints — exactly what `maxItems`/`maxLength` produce
 * once the shared schema's `.max()` limits are converted to JSON Schema.
 *
 * This does NOT weaken validation: the shared Zod schema (with all its
 * `.max()` limits) is still the source of truth for validating the model's
 * actual response after generation (see validate.ts) — this function only
 * simplifies the COPY of the schema Gemini is asked to follow, so Gemini
 * accepts the request in the first place. Only `maxItems` and `maxLength`
 * are stripped; required fields, properties, enums, const/literal values,
 * types, and `additionalProperties` are all preserved unchanged.
 *
 * Always returns a deep copy — the input schema object is never mutated,
 * so the original (used elsewhere, e.g. for documentation or other
 * providers) is unaffected.
 */
export function sanitizeJsonSchemaForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => sanitizeJsonSchemaForGemini(item));
  }

  if (schema && typeof schema === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      if (key === "maxItems" || key === "maxLength") {
        continue;
      }
      sanitized[key] = sanitizeJsonSchemaForGemini(value);
    }
    return sanitized;
  }

  return schema;
}

/**
 * Builds the `generateContent` params for a given request. Pulled out as a
 * pure function (no network calls) so structured-output wiring — in
 * particular, that a provided `jsonSchema` is actually forwarded via
 * `responseJsonSchema` — can be unit-tested without calling Gemini.
 */
export function buildGenerateContentParams(
  model: string,
  request: ContractAnalysisProviderRequest,
) {
  return {
    model,
    contents: [
      {
        role: "user" as const,
        parts: [{ text: request.userPrompt }],
      },
    ],
    config: {
      systemInstruction: request.systemInstructions,
      responseMimeType: "application/json",
      ...(request.jsonSchema
        ? { responseJsonSchema: sanitizeJsonSchemaForGemini(request.jsonSchema) }
        : {}),
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
      // Structured extraction (clause boundaries, amounts, dates) must be as
      // reproducible as possible across runs — temperature 0 removes sampling
      // as a source of run-to-run variance (see clausePostProcessing.ts for
      // why this alone isn't sufficient and what backstops it).
      temperature: 0,
    },
  };
}

export const geminiContractAnalysisProvider: ContractAnalysisProvider = {
  async generate(
    request: ContractAnalysisProviderRequest,
  ): Promise<ContractAnalysisProviderResponse> {
    const client = getClient();
    const model = getModel();

    let response;
    try {
      response = await client.models.generateContent(
        buildGenerateContentParams(model, request),
      );
    } catch (error) {
      if (isRateLimitLikeError(error)) {
        throw rateLimitedError();
      }
      logGeminiRequestErrorDiagnostic(error, model);
      throw providerRequestFailedError();
    }

    const text = response.text;

    if (!text || !text.trim()) {
      throw noUsableResponseError();
    }

    return {
      rawText: text,
      diagnostics: {
        finishReason: response.candidates?.[0]?.finishReason,
        promptTokenCount: response.usageMetadata?.promptTokenCount,
        candidatesTokenCount: response.usageMetadata?.candidatesTokenCount,
        totalTokenCount: response.usageMetadata?.totalTokenCount,
        rawTextLength: text.length,
      },
    };
  },
};
