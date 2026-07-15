import type { ContractType } from "@workspace/contract-types";
import type { LegalChunk } from "../chunk/schema";
import { filterValidCitations } from "../citations/validate";
import type { EmbeddingProvider } from "../embeddings/types";
import { extractQueriedArticleNumber } from "./keywordMatch";
import { getContractTypeLegalConfig, type ContractTypeLegalConfig } from "../registry/contractTypeRegistry";
import type { CollectionScopedSearchParams, LegalChunkRepository } from "./repository";

export const MAX_TOP_K = 10;
export const DEFAULT_TOP_K = 5;
export const MAX_EXCERPT_CHARS = 600;
export const MAX_TOTAL_CONTEXT_CHARS = 6000;

/** Each keyword-match point (see `keywordMatchScore`) contributes this much to the combined score — an exact article-number match (worth 10 points) therefore adds 0.5, enough to meaningfully outrank a mediocre vector-only hit without letting keyword noise dominate a strong semantic match. */
const KEYWORD_SCORE_WEIGHT = 0.05;
/** Flat boost applied to every hit found in a contract type's preferred collections, so a preferred-collection hit always outranks an equally-scored fallback-collection hit (§ retrieval ranking requirement: sector-specific before general fallback). */
const PREFERRED_COLLECTION_BOOST = 0.05;
/** Below this combined score, a result is treated as noise rather than a defensible citation — never surfaced merely to avoid an empty response. */
const MIN_RELEVANCE_SCORE = 0.12;

export interface LegalSearchQuery {
  query: string;
  contractType: ContractType;
  topics?: string[];
  /** Explicit override — bypasses registry routing entirely. Used only by tests/tools that need to target one collection directly. */
  collectionIds?: string[];
  topK?: number;
}

export type LegalSearchStatus = "results_found" | "insufficient_source";

export interface LegalSearchResultItem {
  chunkId: string;
  authority: string;
  documentTitle: string;
  articleNumber: string | null;
  section: string | null;
  excerpt: string;
  officialSourceUrl: string;
  topics: string[];
  score: number;
}

export interface LegalSearchResponse {
  status: LegalSearchStatus;
  results: LegalSearchResultItem[];
}

export interface RetrieveLegalContextDeps {
  repository: LegalChunkRepository;
  embeddingProvider: EmbeddingProvider;
  registry?: Record<string, ContractTypeLegalConfig>;
}

interface ScoredHit {
  chunk: LegalChunk;
  /** Vector similarity + keyword signal only — never includes the preferred/fallback boost. This is what `MIN_RELEVANCE_SCORE` gates on, so a weak/unrelated match can never be pushed over the threshold merely by being in the preferred collection. */
  rawScore: number;
  /** `rawScore` plus the preferred-collection boost — used only to order results that already cleared the threshold on their own merit. */
  combinedScore: number;
}

async function searchScope(
  repository: LegalChunkRepository,
  queryEmbedding: number[],
  queryText: string,
  params: CollectionScopedSearchParams,
  isPreferred: boolean,
): Promise<ScoredHit[]> {
  const [vectorHits, keywordHits] = await Promise.all([
    repository.vectorSearch(queryEmbedding, params),
    repository.keywordSearch(queryText, params),
  ]);

  const merged = new Map<string, { chunk: LegalChunk; vectorSimilarity: number; keywordScore: number }>();
  for (const hit of vectorHits) {
    merged.set(hit.chunk.chunkId, { chunk: hit.chunk, vectorSimilarity: 1 - hit.distance, keywordScore: 0 });
  }
  for (const hit of keywordHits) {
    const existing = merged.get(hit.chunk.chunkId);
    if (existing) {
      existing.keywordScore = hit.matchCount;
    } else {
      merged.set(hit.chunk.chunkId, { chunk: hit.chunk, vectorSimilarity: 0, keywordScore: hit.matchCount });
    }
  }

  return [...merged.values()].map((entry) => {
    const rawScore = entry.vectorSimilarity + entry.keywordScore * KEYWORD_SCORE_WEIGHT;
    return {
      chunk: entry.chunk,
      rawScore,
      combinedScore: rawScore + (isPreferred ? PREFERRED_COLLECTION_BOOST : 0),
    };
  });
}

function boundContext(hits: ScoredHit[]): ScoredHit[] {
  const bounded: ScoredHit[] = [];
  let totalChars = 0;
  for (const hit of hits) {
    const excerptLen = Math.min(hit.chunk.text.length, MAX_EXCERPT_CHARS);
    if (bounded.length > 0 && totalChars + excerptLen > MAX_TOTAL_CONTEXT_CHARS) break;
    bounded.push(hit);
    totalChars += excerptLen;
  }
  return bounded;
}

function toResultItem(hit: ScoredHit): LegalSearchResultItem {
  return {
    chunkId: hit.chunk.chunkId,
    authority: hit.chunk.authority,
    documentTitle: hit.chunk.documentTitle,
    articleNumber: hit.chunk.articleNumber,
    section: hit.chunk.chapterSection,
    excerpt: hit.chunk.text.slice(0, MAX_EXCERPT_CHARS),
    officialSourceUrl: hit.chunk.officialSourceUrl,
    topics: hit.chunk.topics,
    score: Math.round(hit.combinedScore * 1000) / 1000,
  };
}

/**
 * The single retrieval entry point. Routes to the contract type's preferred
 * collections first (§ registry); only searches its fallback collections
 * when the preferred search yields nothing and no explicit
 * `collectionIds` override was given. Applies metadata filters (active
 * status, contract-type applicability, topic when supplied) before ranking,
 * merges vector + keyword signals, and returns an explicit
 * `insufficient_source` result — never a weak, unrelated match — when
 * nothing clears `MIN_RELEVANCE_SCORE`.
 */
export async function retrieveLegalContext(
  query: LegalSearchQuery,
  deps: RetrieveLegalContextDeps,
): Promise<LegalSearchResponse> {
  const topK = Math.max(1, Math.min(query.topK ?? DEFAULT_TOP_K, MAX_TOP_K));
  const config = getContractTypeLegalConfig(query.contractType, deps.registry);

  const hasAnyCollection = query.collectionIds
    ? query.collectionIds.length > 0
    : config.preferredCollections.length > 0 || config.fallbackCollections.length > 0;

  if (!config.enabled || !hasAnyCollection) {
    return { status: "insufficient_source", results: [] };
  }

  const [queryEmbedding] = await deps.embeddingProvider.embed([query.query], "query");
  const topics = query.topics ?? [];

  const baseParams: Omit<CollectionScopedSearchParams, "collectionIds"> = {
    contractType: query.contractType,
    topics,
    activeOnly: true,
    limit: topK * 3,
  };

  let hits: ScoredHit[] = [];

  if (query.collectionIds) {
    hits = await searchScope(deps.repository, queryEmbedding, query.query, { ...baseParams, collectionIds: query.collectionIds }, true);
  } else {
    if (config.preferredCollections.length > 0) {
      hits = await searchScope(
        deps.repository,
        queryEmbedding,
        query.query,
        { ...baseParams, collectionIds: config.preferredCollections },
        true,
      );
    }
    if (hits.every((hit) => hit.rawScore < MIN_RELEVANCE_SCORE) && config.fallbackCollections.length > 0) {
      hits = await searchScope(
        deps.repository,
        queryEmbedding,
        query.query,
        { ...baseParams, collectionIds: config.fallbackCollections },
        false,
      );
    }
  }

  const relevant = hits.filter((hit) => hit.rawScore >= MIN_RELEVANCE_SCORE);
  if (relevant.length === 0) {
    return { status: "insufficient_source", results: [] };
  }

  relevant.sort((a, b) => b.combinedScore - a.combinedScore);

  // An explicit article/section reference in the query (e.g. "Article 9") is a hard
  // signal, not a fuzzy one — a chunk exactly matching it is moved to the front
  // regardless of vector-score noise, rather than merely being favored by a boost
  // that a coincidentally-similar unrelated chunk could still outscore.
  const queriedArticle = extractQueriedArticleNumber(query.query);
  if (queriedArticle) {
    relevant.sort((a, b) => {
      const aExact = a.chunk.articleNumber?.toLowerCase() === queriedArticle.toLowerCase() ? 1 : 0;
      const bExact = b.chunk.articleNumber?.toLowerCase() === queriedArticle.toLowerCase() ? 1 : 0;
      return bExact - aExact;
    });
  }

  const bounded = boundContext(relevant.slice(0, topK));
  const citedResults = filterValidCitations(bounded.map(toResultItem));

  if (citedResults.length === 0) {
    return { status: "insufficient_source", results: [] };
  }

  return {
    status: "results_found",
    results: citedResults,
  };
}
