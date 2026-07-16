/**
 * One contract-semantic chunk of a single session's masked text. Every
 * field needed to locate/cite the chunk travels with the text itself.
 * `text` is masked text ONLY — enforced by the indexing orchestrator, never
 * by this type alone (see `indexing/orchestrate.ts` and
 * `indexing.maskedOnly.test.ts`).
 */
export interface ContractChunk {
  chunkId: string;
  sessionId: string;
  chunkOrder: number;
  /** A heading/section/clause label actually found in the contract text — never fabricated when none exists (see the chunker's own rules). */
  section: string | null;
  text: string;
  topics: string[];
  checksum: string;
  /** True only when no reliable clause/section structure was found and this chunk came from the paragraph-level fallback. */
  needsManualReview: boolean;
}

export interface EmbeddedContractChunk {
  chunk: ContractChunk;
  embedding: number[];
}
