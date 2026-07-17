import { GoogleGenAI } from "@google/genai";
import {
  GeminiKeyPoolConfigError,
  getSharedGeminiKeyPool,
  logGeminiKeyAttempt,
  logGeminiKeyAuthFailed,
  logGeminiKeyCooldownStarted,
  logGeminiKeyPoolExhausted,
  logGeminiKeyRotated,
  type GeminiKeyPool,
  type GeminiKeyState,
} from "@workspace/gemini-key-pool";
import {
  dimensionMismatchError,
  emptyInputError,
  inputTooLargeError,
  missingApiKeyError,
  noUsableEmbeddingError,
  providerRequestFailedError,
  rateLimitedError,
} from "./errors";
import { MAX_EMBEDDING_INPUT_CHARS, type EmbeddingProvider, type EmbeddingTaskType } from "./types";

/**
 * Google's current, generally-available embedding model (confirmed against
 * the installed `@google/genai` SDK's own `Models.embedContent` type
 * definitions and Google's published docs at implementation time — the
 * SDK's own example still shows the older `text-embedding-004`, which
 * Google has since scheduled for deprecation in favor of this model).
 */
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * gemini-embedding-001 defaults to 3072 dimensions but supports Matryoshka
 * (MRL) truncation via `outputDimensionality`, with 768/1536/3072 as
 * Google's own recommended truncation points. 768 is used here: it keeps
 * the pgvector index and storage small for this phase's curated corpus size
 * while remaining a model-recommended value, not an arbitrary one. Every
 * embedding call (documents and queries) must request the same value, or
 * similarity comparisons become meaningless.
 */
export const GEMINI_EMBEDDING_DIMENSIONS = 768;

const TASK_TYPE_MAP: Record<EmbeddingTaskType, string> = {
  document: "RETRIEVAL_DOCUMENT",
  query: "RETRIEVAL_QUERY",
};

/** Defensive batch size — well under any documented per-request item limit, keeps a single failed call's blast radius small. */
const BATCH_SIZE = 32;

/** Used in diagnostics when the provider wasn't given its own operation label. */
const DEFAULT_CONTEXT_LABEL = "embeddings";

function isRateLimitLikeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate.?limit|quota|resource_exhausted/i.test(message);
}

function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/** Same classification as the contract-analysis Gemini provider: a per-key auth/authorization failure, eligible to rotate but never to bypass a genuine auth problem. */
function isAuthLikeError(error: unknown): boolean {
  const status = extractStatusCode(error);
  if (status === 401 || status === 403) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b401\b|\b403\b|unauthorized|forbidden|invalid.{0,20}api.?key|api_key_invalid|permission_denied/i.test(
    message,
  );
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

const clientCache = new Map<string, GoogleGenAI>();

/** One SDK client per configured key, cached by the key's safe id — never keyed by the raw key value. */
function getClientForKey(keyState: GeminiKeyState): GoogleGenAI {
  let client = clientCache.get(keyState.id);
  if (!client) {
    client = new GoogleGenAI({ apiKey: keyState.key });
    clientCache.set(keyState.id, client);
  }
  return client;
}

function getModel(): string {
  return process.env.GEMINI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

function validateInputs(texts: string[]): void {
  if (texts.length === 0) {
    throw emptyInputError();
  }
  for (const text of texts) {
    if (!text || text.trim().length === 0) {
      throw emptyInputError();
    }
    if (text.length > MAX_EMBEDDING_INPUT_CHARS) {
      throw inputTooLargeError(MAX_EMBEDDING_INPUT_CHARS);
    }
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export interface EmbedContentResult {
  embeddings?: Array<{ values?: number[] }>;
}

/**
 * Minimal shape needed from a Gemini client for the pooled-key embed loop
 * below — narrowed to just what's used, so tests never depend on the full
 * `@google/genai` SDK surface.
 */
export interface GeminiPoolEmbedClient {
  models: {
    embedContent(params: {
      model: string;
      contents: string[];
      config: { taskType: string; outputDimensionality: number };
    }): Promise<EmbedContentResult>;
  };
}

export interface GeminiPoolEmbedDeps {
  pool: GeminiKeyPool;
  model: string;
  getClient: (keyState: GeminiKeyState) => GeminiPoolEmbedClient;
}

/**
 * Runs one `embedContent` batch against every currently-eligible key in
 * order (each key attempted at most once for this batch), rotating only on
 * a rate-limit-like or per-key auth failure — identical policy to the
 * contract-analysis text provider's `runGeminiGenerateWithPool`. Any other
 * failure is rethrown immediately without trying another key. Extracted as
 * an injectable function (no direct env/SDK access) so this can be unit
 * tested with a fake pool and a fake client, never a real network call.
 */
export async function embedBatchWithPool(
  batch: string[],
  taskType: EmbeddingTaskType,
  context: string,
  deps: GeminiPoolEmbedDeps,
): Promise<EmbedContentResult> {
  const { pool, model, getClient } = deps;
  const eligibleKeys = pool.getEligibleKeysInOrder();

  if (eligibleKeys.length === 0) {
    logGeminiKeyPoolExhausted(pool.getAllKeyIds(), context);
    throw rateLimitedError();
  }

  let sawRateLimit = false;

  for (let index = 0; index < eligibleKeys.length; index++) {
    const keyState = eligibleKeys[index]!;
    logGeminiKeyAttempt(keyState.id, context);

    try {
      return await getClient(keyState).models.embedContent({
        model,
        contents: batch,
        config: {
          taskType: TASK_TYPE_MAP[taskType],
          outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS,
        },
      });
    } catch (error) {
      const nextKey = eligibleKeys[index + 1];

      if (isRateLimitLikeError(error)) {
        sawRateLimit = true;
        pool.startCooldown(keyState.id);
        logGeminiKeyCooldownStarted(keyState.id, "RATE_LIMITED", pool.cooldownSeconds, context);
        if (nextKey) {
          logGeminiKeyRotated(keyState.id, nextKey.id, "RATE_LIMITED", context);
          continue;
        }
        break;
      }

      if (isAuthLikeError(error)) {
        logGeminiKeyAuthFailed(keyState.id, context);
        if (nextKey) {
          logGeminiKeyRotated(keyState.id, nextKey.id, "AUTH_FAILED", context);
          continue;
        }
        break;
      }

      throw providerRequestFailedError(error instanceof Error ? error.message : String(error));
    }
  }

  logGeminiKeyPoolExhausted(
    eligibleKeys.map((k) => k.id),
    context,
  );
  throw sawRateLimit ? rateLimitedError() : providerRequestFailedError();
}

export interface GeminiEmbeddingProviderOptions {
  /** Short operation label (e.g. "contractRag", "legalRag") used only for safe key-pool diagnostics. */
  context?: string;
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  public readonly dimensions = GEMINI_EMBEDDING_DIMENSIONS;
  private readonly context: string;

  constructor(options: GeminiEmbeddingProviderOptions = {}) {
    this.context = options.context ?? DEFAULT_CONTEXT_LABEL;
  }

  async embed(texts: string[], taskType: EmbeddingTaskType): Promise<number[][]> {
    validateInputs(texts);

    const pool = getPool();
    const model = getModel();
    const results: number[][] = [];

    for (const batch of chunkArray(texts, BATCH_SIZE)) {
      const response = await embedBatchWithPool(batch, taskType, this.context, {
        pool,
        model,
        getClient: getClientForKey,
      });

      const embeddings = response.embeddings;
      if (!embeddings || embeddings.length !== batch.length) {
        throw noUsableEmbeddingError();
      }

      for (const embedding of embeddings) {
        const values = embedding.values;
        if (!values || values.length === 0) {
          throw noUsableEmbeddingError();
        }
        if (values.length !== this.dimensions) {
          throw dimensionMismatchError(this.dimensions, values.length);
        }
        results.push(values);
      }
    }

    return results;
  }
}
