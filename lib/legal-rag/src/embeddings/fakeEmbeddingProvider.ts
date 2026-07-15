import { createHash } from "node:crypto";
import { tokenizeContentWords } from "../retrieval/textTokens";
import { emptyInputError, inputTooLargeError } from "./errors";
import { MAX_EMBEDDING_INPUT_CHARS, type EmbeddingProvider, type EmbeddingTaskType } from "./types";

/**
 * Deterministic, offline, no-network embedding provider used only by tests
 * (and available as a documented fallback dependency-injection point for
 * anything that must never call a real API). It is a real bag-of-words
 * feature-hashing embedding — not random noise — so fixtures that share
 * vocabulary genuinely score as more similar than fixtures that don't,
 * letting ranking-order tests be meaningful rather than coincidental.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  public readonly dimensions: number;

  constructor(dimensions = 64) {
    this.dimensions = dimensions;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async embed(texts: string[], _taskType: EmbeddingTaskType): Promise<number[][]> {
    if (texts.length === 0) {
      throw emptyInputError();
    }
    return texts.map((text) => {
      if (!text || text.trim().length === 0) {
        throw emptyInputError();
      }
      if (text.length > MAX_EMBEDDING_INPUT_CHARS) {
        throw inputTooLargeError(MAX_EMBEDDING_INPUT_CHARS);
      }
      return this.hashEmbed(text);
    });
  }

  private hashEmbed(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const tokens = tokenizeContentWords(text);

    for (const token of tokens) {
      const digest = createHash("sha256").update(token).digest();
      const bucket = digest.readUInt32BE(0) % this.dimensions;
      vector[bucket] += 1;
    }

    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) {
      return vector;
    }
    return vector.map((v) => v / norm);
  }
}
