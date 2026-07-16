export interface ContractRagRuntimeConfig {
  /** How long a session (and its chunks) remains retrievable after creation. */
  ttlMinutes: number;
  /** A masked contract longer than this is truncated before chunking — never embeds an unbounded document. */
  maxIndexedChars: number;
  /** A contract producing more chunks than this has its excess chunks dropped (from the end) rather than indexing an unbounded number. */
  maxChunksPerContract: number;
  /** Soft cap a single chunk's text is sub-split at. */
  maxChunkChars: number;
  /** A user's search query longer than this is rejected at the API layer. */
  maxQueryChars: number;
  /** Hard ceiling on `topK`, regardless of what a caller requests. */
  maxTopK: number;
  /** A returned excerpt is truncated to this length. */
  maxExcerptChars: number;
  /** Total character budget across all returned excerpts combined. */
  maxTotalContextChars: number;
  /** Below this combined relevance score, a candidate is treated as noise, not a result. */
  minRelevanceScore: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveFloat(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const DEFAULT_CONTRACT_RAG_CONFIG: ContractRagRuntimeConfig = {
  ttlMinutes: 120,
  maxIndexedChars: 200_000,
  maxChunksPerContract: 400,
  maxChunkChars: 2_000,
  maxQueryChars: 500,
  maxTopK: 10,
  maxExcerptChars: 600,
  maxTotalContextChars: 6_000,
  minRelevanceScore: 0.12,
};

/**
 * Reads every bound from the environment (falling back to the documented
 * defaults above when unset/invalid) — never a hardcoded literal scattered
 * through the codebase. Read once per call rather than cached at module load
 * so tests can freely change `process.env` between cases.
 */
export function getContractRagConfig(): ContractRagRuntimeConfig {
  return {
    ttlMinutes: parsePositiveInt(process.env.CONTRACT_RAG_TTL_MINUTES, DEFAULT_CONTRACT_RAG_CONFIG.ttlMinutes),
    maxIndexedChars: parsePositiveInt(process.env.CONTRACT_RAG_MAX_INDEXED_CHARS, DEFAULT_CONTRACT_RAG_CONFIG.maxIndexedChars),
    maxChunksPerContract: parsePositiveInt(
      process.env.CONTRACT_RAG_MAX_CHUNKS_PER_CONTRACT,
      DEFAULT_CONTRACT_RAG_CONFIG.maxChunksPerContract,
    ),
    maxChunkChars: parsePositiveInt(process.env.CONTRACT_RAG_MAX_CHUNK_CHARS, DEFAULT_CONTRACT_RAG_CONFIG.maxChunkChars),
    maxQueryChars: parsePositiveInt(process.env.CONTRACT_RAG_MAX_QUERY_CHARS, DEFAULT_CONTRACT_RAG_CONFIG.maxQueryChars),
    maxTopK: parsePositiveInt(process.env.CONTRACT_RAG_MAX_TOP_K, DEFAULT_CONTRACT_RAG_CONFIG.maxTopK),
    maxExcerptChars: parsePositiveInt(process.env.CONTRACT_RAG_MAX_EXCERPT_CHARS, DEFAULT_CONTRACT_RAG_CONFIG.maxExcerptChars),
    maxTotalContextChars: parsePositiveInt(
      process.env.CONTRACT_RAG_MAX_TOTAL_CONTEXT_CHARS,
      DEFAULT_CONTRACT_RAG_CONFIG.maxTotalContextChars,
    ),
    minRelevanceScore: parsePositiveFloat(
      process.env.CONTRACT_RAG_MIN_RELEVANCE_SCORE,
      DEFAULT_CONTRACT_RAG_CONFIG.minRelevanceScore,
    ),
  };
}
