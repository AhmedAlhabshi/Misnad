/**
 * Gemini's embedding API distinguishes how a piece of text will be used —
 * `"document"` for text being indexed (chunks), `"query"` for a search
 * question — and produces measurably better retrieval when this is set
 * correctly (Gemini's own `taskType`: `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`).
 * Every `EmbeddingProvider` implementation must honor this distinction, not
 * just Gemini's.
 */
export type EmbeddingTaskType = "document" | "query";

/** A hard ceiling on any single text handed to an embedding provider — this phase only ever embeds public legal chunks (already capped at 4000 chars by the chunk schema) and short user search questions, never contract/user PII. */
export const MAX_EMBEDDING_INPUT_CHARS = 6000;

/**
 * The retrieval domain depends only on this interface, never on the Gemini
 * SDK directly — swapping providers later (or adding a second one) never
 * touches chunking, ingestion, or retrieval logic.
 */
export interface EmbeddingProvider {
  /** The fixed vector length every embedding this provider returns must have. */
  readonly dimensions: number;
  /**
   * Embeds a batch of texts. Implementations must: reject empty input,
   * reject any text exceeding `MAX_EMBEDDING_INPUT_CHARS`, validate every
   * returned vector has exactly `dimensions` values, and never send
   * contract/user PII — this phase only ever embeds public legal chunk text
   * and legal search questions.
   */
  embed(texts: string[], taskType: EmbeddingTaskType): Promise<number[][]>;
}
