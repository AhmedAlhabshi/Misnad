/** Configurable per-source-type caps applied after ranking/dedup, before the token budget pass. */
export interface RankingLimits {
  maxContractEvidence: number;
  maxLegalEvidence: number;
  maxFinancialFacts: number;
  maxAnalysisFacts: number;
}

export const DEFAULT_RANKING_LIMITS: RankingLimits = {
  maxContractEvidence: 6,
  maxLegalEvidence: 6,
  maxFinancialFacts: 8,
  maxAnalysisFacts: 6,
};

/**
 * Every relevance score this package emits is clamped into [0, 1] here, in
 * one place. Contract RAG and Legal RAG's own combined scores can exceed 1
 * (they're an unbounded blend of vector similarity, keyword hits, and
 * collection-preference boosts — see their own `service.ts` files) — this
 * clamp never rescales or reinterprets those scores, it only bounds them so
 * relevanceScore is comparable across every evidence source in this
 * package's own ranking/budget passes.
 */
export function clampRelevanceScore(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1, Math.max(0, raw));
}

/**
 * Sorts by `relevanceScore` descending (stable — equal scores keep their
 * original relative order, which is itself already the upstream retrieval
 * service's own ranking), removes duplicates by `dedupeKey` (keeping the
 * first/highest-ranked occurrence), then caps to `limit`. This is a second,
 * independent pass on top of whatever ranking/dedup the underlying
 * retrieval service already performed — it's what lets this package
 * guarantee a stable, deduplicated, size-bounded result regardless of what
 * any given source or future source returns.
 */
export function dedupeAndRank<T extends { relevanceScore: number }>(
  items: readonly T[],
  dedupeKey: (item: T) => string,
  limit: number,
): T[] {
  const sorted = [...items].sort((a, b) => b.relevanceScore - a.relevanceScore);
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of sorted) {
    const key = dedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}
