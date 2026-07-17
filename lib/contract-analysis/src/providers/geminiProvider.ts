import { GoogleGenAI } from "@google/genai";
import {
  GeminiKeyPoolConfigError,
  getSharedGeminiKeyPool,
  logGeminiKeyAttemptStarted,
  logGeminiKeyAttemptTimedOut,
  logGeminiKeyAttemptCompleted,
  logGeminiPoolOperationCompleted,
  logGeminiKeyAuthFailed,
  logGeminiKeyCooldownStarted,
  logGeminiKeyPoolExhausted,
  logGeminiKeyRotated,
  parseGeminiAttemptTimeoutMs,
  type GeminiKeyPool,
  type GeminiKeyState,
} from "@workspace/gemini-key-pool";
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

/** Used in diagnostics when a request doesn't specify its own operation label. */
const DEFAULT_CONTEXT_LABEL = "gemini";

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

/**
 * A temporary provider-availability failure — Gemini itself is momentarily
 * overloaded/down, as opposed to the request or the key being at fault.
 * HTTP 503, an `UNAVAILABLE` status, "high demand"/"temporarily unavailable"
 * wording, and timeout/network-level failures (via `isTimeoutOrNetworkLikeError`)
 * all fall in this bucket. Eligible to rotate to the next key (Gemini's
 * overload is often per-backend-instance, not per-key), never to bypass a
 * genuine request problem.
 */
function isTemporarilyUnavailableError(error: unknown, statusCode: number | undefined, errorCode: string | undefined): boolean {
  if (statusCode === 503) return true;
  const message = error instanceof Error ? error.message : String(error);
  if (/\bUNAVAILABLE\b/.test(message)) return true;
  if (/high demand/i.test(message)) return true;
  if (/temporarily unavailable/i.test(message)) return true;
  return isTimeoutOrNetworkLikeError(error, errorCode);
}

/**
 * A per-key authentication/authorization failure — the key itself is
 * invalid, revoked, or lacks permission, as opposed to a request-shape
 * problem or a rate/quota limit. Only this class of failure (plus
 * rate-limit-like failures) is ever eligible to rotate to the next
 * configured key; every other failure is rethrown immediately without
 * trying another key.
 */
function isAuthLikeError(error: unknown, statusCode: number | undefined): boolean {
  if (statusCode === 401 || statusCode === 403) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b401\b|\b403\b|unauthorized|forbidden|invalid.{0,20}api.?key|api_key_invalid|permission_denied/i.test(
    message,
  );
}

/**
 * Thrown by `withAttemptTimeout` when a single key's `generateContent` call
 * hasn't responded within `GEMINI_ATTEMPT_TIMEOUT_MS`. Deliberately its own
 * class (rather than a generic timeout-shaped message) so the rotation loop
 * can recognize "we gave up waiting" as its own reason — distinct from the
 * pre-existing `isTemporarilyUnavailableError` message/status sniffing —
 * while still rotating and cooling down exactly the same way.
 */
class GeminiAttemptTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Gemini key attempt exceeded the ${timeoutMs}ms attempt timeout.`);
    this.name = "GeminiAttemptTimeoutError";
  }
}

/**
 * Races a single key's `generateContent` call against `timeoutMs`. This is a
 * race, not a true cancellation — the underlying SDK call has no abort
 * signal in the minimal `GeminiPoolGenerateClient` surface this module
 * depends on, so a timed-out call may still resolve/reject in the
 * background after rotation has already moved on; its result is simply
 * ignored (the `.then` handlers below are the only listeners, so this can
 * never produce an unhandled rejection).
 */
function withAttemptTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new GeminiAttemptTimeoutError(timeoutMs)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function getAttemptTimeoutMs(): number {
  return parseGeminiAttemptTimeoutMs(process.env);
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

/**
 * Minimal shape needed from a Gemini client for the pooled-key generate
 * loop below — narrowed to just what's used, so the loop (and its tests)
 * never depend on the full `@google/genai` SDK surface.
 */
export interface GeminiPoolGenerateClient {
  models: {
    generateContent(params: ReturnType<typeof buildGenerateContentParams>): Promise<{
      text?: string;
      candidates?: Array<{ finishReason?: string }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    }>;
  };
}

export interface GeminiPoolGenerateDeps {
  pool: GeminiKeyPool;
  model: string;
  getClient: (keyState: GeminiKeyState) => GeminiPoolGenerateClient;
  /** Defaults to `GEMINI_ATTEMPT_TIMEOUT_MS` (see `env.ts`) when omitted — injectable so tests can use a small value instead of waiting out the real default. */
  attemptTimeoutMs?: number;
}

/**
 * Core pooled-key generate loop. Extracted as an injectable function (no
 * direct env/SDK access of its own) so key-rotation behavior — the exact
 * focus of this feature — can be unit-tested with a fake pool and a fake
 * client, never a real network call or real env vars. The exported
 * `geminiContractAnalysisProvider.generate()` below is a thin wrapper that
 * supplies the real shared pool, model, and SDK client.
 *
 * Each currently-eligible key is captured once at the start and attempted
 * at most once, and each attempt is bounded by `attemptTimeoutMs` (default
 * `GEMINI_ATTEMPT_TIMEOUT_MS`) — a key that neither succeeds nor errors
 * within that window is abandoned and rotated past immediately, exactly like
 * an explicit provider error, rather than left to hang for however long the
 * underlying SDK call would otherwise take. Only an eligible temporary
 * failure — rate-limit-like, temporarily-unavailable-like (503/UNAVAILABLE/
 * high demand/timeout/network), a per-key attempt timeout, or an
 * authentication failure specific to that one key — rotates to the next
 * key, immediately and without sleeping; any other failure (malformed
 * request, schema rejection, empty response, etc.) is rethrown immediately
 * without trying further keys — identical to the single-key behavior this
 * replaces.
 *
 * If any key failed for a rate-limit-like or temporarily-unavailable-like
 * reason during this call, the final thrown error is `RATE_LIMITED` (so the
 * existing Gemini → OpenRouter fallback in
 * `service.ts`/`personalizedAnalysisService.ts`/`composer.ts` triggers,
 * completely unchanged) — this now only happens once the whole pool is
 * exhausted rather than after a single key's first failure. If the pool is
 * exhausted purely on authentication failures (no retryable failure seen at
 * all), a generic `PROVIDER_REQUEST_FAILED` is thrown instead, since that is
 * not a temporary condition and should not be silently smoothed over as one.
 */
export async function runGeminiGenerateWithPool(
  request: ContractAnalysisProviderRequest,
  deps: GeminiPoolGenerateDeps,
): Promise<ContractAnalysisProviderResponse> {
  const { pool, model, getClient } = deps;
  const context = request.context ?? DEFAULT_CONTEXT_LABEL;
  const attemptTimeoutMs = deps.attemptTimeoutMs ?? getAttemptTimeoutMs();
  const eligibleKeys = pool.getEligibleKeysInOrder();
  const operationStartedAt = Date.now();

  if (eligibleKeys.length === 0) {
    logGeminiKeyPoolExhausted(pool.getAllKeyIds(), context);
    logGeminiPoolOperationCompleted(context, Date.now() - operationStartedAt, "rate_limited");
    throw rateLimitedError();
  }

  let sawRetryableFailure = false;

  for (let index = 0; index < eligibleKeys.length; index++) {
    const keyState = eligibleKeys[index]!;
    logGeminiKeyAttemptStarted(keyState.id, context);
    const attemptStartedAt = Date.now();

    let response;
    try {
      response = await withAttemptTimeout(
        getClient(keyState).models.generateContent(buildGenerateContentParams(model, request)),
        attemptTimeoutMs,
      );
      logGeminiKeyAttemptCompleted(keyState.id, context, Date.now() - attemptStartedAt, "success");
    } catch (error) {
      const durationMs = Date.now() - attemptStartedAt;
      const nextKey = eligibleKeys[index + 1];

      if (error instanceof GeminiAttemptTimeoutError) {
        logGeminiKeyAttemptTimedOut(keyState.id, context, durationMs);
        sawRetryableFailure = true;
        pool.startCooldown(keyState.id);
        logGeminiKeyCooldownStarted(keyState.id, "PROVIDER_TIMEOUT", pool.cooldownSeconds, context);
        if (nextKey) {
          logGeminiKeyRotated(keyState.id, nextKey.id, "PROVIDER_TIMEOUT", context);
          continue;
        }
        break;
      }

      logGeminiKeyAttemptCompleted(keyState.id, context, durationMs, "error");

      const statusCode = extractStatusCode(error);
      const errorCode = extractErrorCode(error);

      if (isRateLimitLikeError(error)) {
        sawRetryableFailure = true;
        pool.startCooldown(keyState.id);
        logGeminiKeyCooldownStarted(keyState.id, "RATE_LIMITED", pool.cooldownSeconds, context);
        if (nextKey) {
          logGeminiKeyRotated(keyState.id, nextKey.id, "RATE_LIMITED", context);
          continue;
        }
        break;
      }

      if (isTemporarilyUnavailableError(error, statusCode, errorCode)) {
        sawRetryableFailure = true;
        pool.startCooldown(keyState.id);
        logGeminiKeyCooldownStarted(keyState.id, "TEMPORARILY_UNAVAILABLE", pool.cooldownSeconds, context);
        if (nextKey) {
          logGeminiKeyRotated(keyState.id, nextKey.id, "TEMPORARILY_UNAVAILABLE", context);
          continue;
        }
        break;
      }

      if (isAuthLikeError(error, statusCode)) {
        logGeminiKeyAuthFailed(keyState.id, context);
        if (nextKey) {
          logGeminiKeyRotated(keyState.id, nextKey.id, "AUTH_FAILED", context);
          continue;
        }
        break;
      }

      // Not an eligible-for-rotation failure (bad request, schema rejection,
      // etc.) — fail immediately without trying any other key, exactly as
      // the single-key provider always has.
      logGeminiRequestErrorDiagnostic(error, model);
      throw providerRequestFailedError();
    }

    const text = response.text;
    if (!text || !text.trim()) {
      throw noUsableResponseError();
    }

    logGeminiPoolOperationCompleted(context, Date.now() - operationStartedAt, "success");

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
  }

  logGeminiKeyPoolExhausted(
    eligibleKeys.map((k) => k.id),
    context,
  );
  const outcome = sawRetryableFailure ? "rate_limited" : "auth_failed";
  logGeminiPoolOperationCompleted(context, Date.now() - operationStartedAt, outcome);
  throw sawRetryableFailure ? rateLimitedError() : providerRequestFailedError();
}

const clientCache = new Map<string, GoogleGenAI>();

/** One SDK client per configured key, constructed lazily and cached by the key's safe id (never keyed by the raw key value itself). */
function getClientForKey(keyState: GeminiKeyState): GoogleGenAI {
  let client = clientCache.get(keyState.id);
  if (!client) {
    client = new GoogleGenAI({ apiKey: keyState.key });
    clientCache.set(keyState.id, client);
  }
  return client;
}

function getPool(): GeminiKeyPool {
  try {
    return getSharedGeminiKeyPool();
  } catch (error) {
    if (error instanceof GeminiKeyPoolConfigError) {
      throw missingApiKeyError();
    }
    throw error;
  }
}

export const geminiContractAnalysisProvider: ContractAnalysisProvider = {
  async generate(
    request: ContractAnalysisProviderRequest,
  ): Promise<ContractAnalysisProviderResponse> {
    return runGeminiGenerateWithPool(request, {
      pool: getPool(),
      model: getModel(),
      getClient: getClientForKey,
      attemptTimeoutMs: getAttemptTimeoutMs(),
    });
  },
};
