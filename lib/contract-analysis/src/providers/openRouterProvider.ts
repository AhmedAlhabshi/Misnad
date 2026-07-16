import {
  missingOpenRouterApiKeyError,
  noUsableResponseError,
  providerRequestFailedError,
  rateLimitedError,
} from "../errors";
import type {
  ContractAnalysisProvider,
  ContractAnalysisProviderRequest,
  ContractAnalysisProviderResponse,
} from "./types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Temporary development-only fallback model, used only when Gemini itself
 * is rate-limited/quota-limited.
 *
 * Selected: qwen/qwen3-next-80b-a3b-instruct:free (verified live against
 * OpenRouter's /api/v1/models on the date this fallback was added).
 *
 * Why this one, among OpenRouter's current free-tier models:
 * - Free (no billing risk for today's live testing).
 * - Qwen models are explicitly documented by Alibaba as strong multilingual
 *   models with dedicated Arabic-language support — a better documented fit
 *   for "Arabic contract understanding" than e.g. Llama 3.x (Arabic is not
 *   one of Llama 3.3's officially listed supported languages) or Gemma
 *   (same underlying vendor as the primary provider we're falling away
 *   from, which would undercut the point of a fallback).
 * - 262,144-token context window. Our largest real test contract so far is
 *   68,642 characters (well under half that many tokens even generously),
 *   leaving very large headroom for the full system+user prompt plus a
 *   16,384-token response — the same failure mode (MAX_TOKENS/truncation)
 *   that hit Gemini at 8192 is not a concern here.
 * - An "-instruct" (not "-coder") variant, matching this task's general
 *   document-understanding/prose-extraction nature rather than a
 *   code-generation task.
 */
const DEFAULT_OPENROUTER_MODEL = "qwen/qwen3-next-80b-a3b-instruct:free";

/**
 * Matches the current Gemini maxOutputTokens budget (see geminiProvider.ts).
 * This model's OpenRouter listing reports `max_completion_tokens: null`
 * (no distinct output-only cap) with a 262,144-token shared context window
 * (verified live against openrouter.ai/api/v1/models), so 65,536 leaves
 * very large headroom even for our biggest real test contract's prompt.
 */
const OPENROUTER_MAX_OUTPUT_TOKENS = 65536;

function getModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
}

/**
 * Builds the OpenRouter chat-completions request body for a given request.
 * Pulled out as a pure function (no network calls) so request construction
 * can be unit-tested without calling OpenRouter.
 *
 * Uses the basic `json_object` response_format (universally supported
 * across OpenRouter models) rather than strict `json_schema` mode, since
 * strict-schema support is not guaranteed for every free-tier model. The
 * exact ContractUnderstanding shape is still enforced the same way it is
 * for every provider: via `validateContractUnderstanding` after the fact,
 * with the same one correction/retry attempt.
 */
export function buildOpenRouterRequestBody(
  model: string,
  request: ContractAnalysisProviderRequest,
): Record<string, unknown> {
  return {
    model,
    messages: [
      { role: "system" as const, content: request.systemInstructions },
      { role: "user" as const, content: request.userPrompt },
    ],
    response_format: { type: "json_object" as const },
    max_tokens: OPENROUTER_MAX_OUTPUT_TOKENS,
    // Same determinism rationale as geminiProvider.ts's temperature: 0 — most
    // OpenRouter-routed models (including the qwen fallback) support this
    // standard OpenAI-compatible field.
    temperature: 0,
  };
}

interface OpenRouterResponseBody {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

const DIAGNOSTIC_ERROR_BODY_PREVIEW_CHARS = 300;

const DEFAULT_RETRY_AFTER_SECONDS = 3;
const MAX_RETRY_AFTER_SECONDS = 5;

/**
 * Parses the `Retry-After` header (a plain number of seconds, per what
 * OpenRouter actually sends) into a safe wait duration: falls back to
 * DEFAULT_RETRY_AFTER_SECONDS if missing/invalid, and never exceeds
 * MAX_RETRY_AFTER_SECONDS.
 */
function resolveRetryAfterSeconds(headerValue: string | null): number {
  if (headerValue === null) {
    return DEFAULT_RETRY_AFTER_SECONDS;
  }

  const parsed = Number(headerValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_RETRY_AFTER_SECONDS;
  }

  return Math.min(parsed, MAX_RETRY_AFTER_SECONDS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * TEMPORARY development-only diagnostic for OpenRouter HTTP failures (429s
 * and other non-ok statuses), which were previously swallowed entirely —
 * the status was checked but never logged, and the error body/headers were
 * never read at all.
 *
 * Reads the error response body exactly once, extracts only an allowlisted
 * set of safe fields from OpenRouter's documented `{ error: { code, type,
 * message } }` shape, plus a small allowlist of rate-limit-related response
 * headers. Never logs the full body/response object, outgoing request
 * headers, the API key, or any contract/document content. Never throws —
 * a diagnostics failure must never interfere with the real error path.
 */
async function logOpenRouterHttpErrorDiagnostic(
  res: globalThis.Response,
  model: string,
): Promise<void> {
  try {
    let rawBody = "";
    try {
      rawBody = await res.text();
    } catch {
      rawBody = "";
    }

    let errorCode: unknown;
    let errorType: unknown;
    let errorMessage: string | undefined;

    try {
      const parsed = JSON.parse(rawBody) as {
        error?: { code?: unknown; type?: unknown; message?: unknown };
      };
      if (parsed?.error && typeof parsed.error === "object") {
        errorCode = parsed.error.code;
        errorType = parsed.error.type;
        errorMessage =
          typeof parsed.error.message === "string" ? parsed.error.message : undefined;
      }
    } catch {
      // Malformed JSON — fall through to the raw-text preview below.
    }

    if (errorMessage === undefined) {
      errorMessage = rawBody.slice(0, DIAGNOSTIC_ERROR_BODY_PREVIEW_CHARS);
    }

    console.error("[MISNAD_DIAGNOSTIC]", {
      event: "openrouter_http_error",
      provider: "openrouter",
      model,
      httpStatus: res.status,
      errorCode,
      errorType,
      errorMessage,
      retryAfter: res.headers.get("retry-after"),
      rateLimitLimit: res.headers.get("x-ratelimit-limit"),
      rateLimitRemaining: res.headers.get("x-ratelimit-remaining"),
      rateLimitReset: res.headers.get("x-ratelimit-reset"),
    });
  } catch {
    // Diagnostics must never interfere with the real error path.
  }
}

async function performOpenRouterFetch(
  apiKey: string,
  model: string,
  request: ContractAnalysisProviderRequest,
): Promise<globalThis.Response> {
  try {
    return await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Misnad",
      },
      body: JSON.stringify(buildOpenRouterRequestBody(model, request)),
    });
  } catch {
    throw providerRequestFailedError();
  }
}

export const openRouterContractAnalysisProvider: ContractAnalysisProvider = {
  async generate(
    request: ContractAnalysisProviderRequest,
  ): Promise<ContractAnalysisProviderResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw missingOpenRouterApiKeyError();
    }

    const model = getModel();

    let res = await performOpenRouterFetch(apiKey, model, request);

    // Maximum one transport-level retry, and only for a 429 — a single
    // brief wait (bounded by Retry-After, capped at MAX_RETRY_AFTER_SECONDS)
    // then one retry of the exact same request. This is separate from, and
    // does not alter, the existing analysis-level correction/retry attempt.
    if (res.status === 429) {
      const retryAfterSeconds = resolveRetryAfterSeconds(res.headers.get("retry-after"));

      console.error("[MISNAD_DIAGNOSTIC]", {
        event: "openrouter_rate_limit_retry",
        provider: "openrouter",
        model,
        retryAfterSeconds,
        retryAttempt: 1,
      });

      await sleep(retryAfterSeconds * 1000);
      res = await performOpenRouterFetch(apiKey, model, request);
    }

    if (!res.ok) {
      await logOpenRouterHttpErrorDiagnostic(res, model);

      if (res.status === 429) {
        throw rateLimitedError();
      }

      throw providerRequestFailedError();
    }

    let body: OpenRouterResponseBody;
    try {
      body = (await res.json()) as OpenRouterResponseBody;
    } catch {
      throw noUsableResponseError();
    }

    const choice = body?.choices?.[0];
    const text = choice?.message?.content;

    if (!text || !text.trim()) {
      throw noUsableResponseError();
    }

    return {
      rawText: text,
      diagnostics: {
        finishReason: choice?.finish_reason ?? undefined,
        promptTokenCount: body?.usage?.prompt_tokens,
        candidatesTokenCount: body?.usage?.completion_tokens,
        totalTokenCount: body?.usage?.total_tokens,
        rawTextLength: text.length,
      },
    };
  },
};
