import type { AnalysisLanguage } from "@workspace/contract-types";
import type { EmbeddingProvider } from "@workspace/legal-rag";
import { getContractRagConfig } from "../config";
import { isValidContractRagSessionIdFormat } from "../session/sessionId";
import { keywordMatchScore } from "./keywordMatch";
import type { ContractRagRepository } from "./repository";

export type ContractRetrievalStatus = "results_found" | "insufficient_contract_context" | "session_unavailable";

export interface ContractRetrievalResultItem {
  chunkId: string;
  section: string | null;
  excerpt: string;
  chunkOrder: number;
  score: number;
}

export interface ContractRetrievalResult {
  status: ContractRetrievalStatus;
  results: ContractRetrievalResultItem[];
}

export interface RetrieveContractContextInput {
  sessionId: string;
  query: string;
  topK?: number;
  selectedClauseTitle?: string | null;
  language: AnalysisLanguage;
}

export interface RetrieveContractContextDeps {
  repository: ContractRagRepository;
  embeddingProvider: EmbeddingProvider;
}

/** Blends a normalized vector-similarity score with a bounded keyword-match contribution so an exact clause/financial-term match can outrank a merely-nearby vector neighbor, without keyword counts alone dominating the ranking. */
function combinedScore(similarity: number, rawKeywordScore: number): number {
  const keywordContribution = Math.min(rawKeywordScore * 0.05, 1);
  return similarity * 0.65 + keywordContribution * 0.35;
}

/**
 * Retrieves contract evidence for one session only: hard-filters to an
 * active, non-expired session BEFORE any ranking happens (an
 * expired/invalid/nonexistent session never reaches the scoring code path
 * at all and always maps to the same `session_unavailable` status, so a
 * caller can never distinguish "expired" from "never existed" from
 * "belongs to someone else"). Hybrid-ranks the session's own chunks by
 * vector similarity plus keyword/clause-title match, and returns only
 * chunks clearing the configured `minRelevanceScore` — never pads results
 * with irrelevant chunks merely to fill `topK`.
 */
export async function retrieveContractContext(
  input: RetrieveContractContextInput,
  deps: RetrieveContractContextDeps,
): Promise<ContractRetrievalResult> {
  const config = getContractRagConfig();

  if (!isValidContractRagSessionIdFormat(input.sessionId)) {
    return { status: "session_unavailable", results: [] };
  }

  const session = await deps.repository.getActiveSession(input.sessionId);
  if (!session) {
    return { status: "session_unavailable", results: [] };
  }

  const query = input.query.slice(0, config.maxQueryChars).trim();
  if (query.length === 0) {
    return { status: "insufficient_contract_context", results: [] };
  }

  const effectiveTopK = Math.min(input.topK ?? config.maxTopK, config.maxTopK);

  const [queryEmbedding] = await deps.embeddingProvider.embed([query], "query");
  const vectorLimit = Math.max(effectiveTopK * 4, 20);
  const [vectorCandidates, allChunks] = await Promise.all([
    deps.repository.vectorSearch(input.sessionId, queryEmbedding, vectorLimit),
    deps.repository.getSessionChunks(input.sessionId),
  ]);

  const distanceByChunkId = new Map(vectorCandidates.map((candidate) => [candidate.chunk.chunkId, candidate.distance]));

  const scored = allChunks.map((chunk) => {
    const distance = distanceByChunkId.get(chunk.chunkId);
    const similarity = distance === undefined ? 0 : 1 - distance;
    const rawKeywordScore = keywordMatchScore(chunk, query, input.selectedClauseTitle ?? null);
    return { chunk, score: combinedScore(similarity, rawKeywordScore) };
  });

  const ranked = scored
    .filter((entry) => entry.score >= config.minRelevanceScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, effectiveTopK);

  if (ranked.length === 0) {
    return { status: "insufficient_contract_context", results: [] };
  }

  const results: ContractRetrievalResultItem[] = [];
  let totalContextChars = 0;
  for (const entry of ranked) {
    const remainingBudget = config.maxTotalContextChars - totalContextChars;
    if (remainingBudget <= 0) break;
    const excerptLimit = Math.min(config.maxExcerptChars, remainingBudget);
    const excerpt = entry.chunk.text.slice(0, excerptLimit);
    totalContextChars += excerpt.length;
    results.push({
      chunkId: entry.chunk.chunkId,
      section: entry.chunk.section,
      excerpt,
      chunkOrder: entry.chunk.chunkOrder,
      score: entry.score,
    });
  }

  return { status: "results_found", results };
}
