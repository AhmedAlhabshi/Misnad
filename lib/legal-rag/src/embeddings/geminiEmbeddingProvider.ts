import { GoogleGenAI } from "@google/genai";
import {
  dimensionMismatchError,
  emptyInputError,
  inputTooLargeError,
  missingApiKeyError,
  noUsableEmbeddingError,
  providerRequestFailedError,
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

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  public readonly dimensions = GEMINI_EMBEDDING_DIMENSIONS;

  async embed(texts: string[], taskType: EmbeddingTaskType): Promise<number[][]> {
    validateInputs(texts);

    const client = getClient();
    const model = getModel();
    const results: number[][] = [];

    for (const batch of chunkArray(texts, BATCH_SIZE)) {
      let response;
      try {
        response = await client.models.embedContent({
          model,
          contents: batch,
          config: {
            taskType: TASK_TYPE_MAP[taskType],
            outputDimensionality: this.dimensions,
          },
        });
      } catch (err) {
        throw providerRequestFailedError(err instanceof Error ? err.message : String(err));
      }

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
