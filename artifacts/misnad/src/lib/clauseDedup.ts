import type { ImportantClause } from "@/types/analysis";

const ARABIC_DIACRITICS_PATTERN = /[ً-ٰٟ]/g;
const NON_WORD_PATTERN = /[^\p{L}\p{N}\s]/gu;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(ARABIC_DIACRITICS_PATTERN, "")
    .replace(NON_WORD_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): Set<string> {
  return new Set(normalizeText(text).split(" ").filter((token) => token.length > 1));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersectionSize = 0;
  for (const token of a) {
    if (b.has(token)) intersectionSize++;
  }
  const unionSize = a.size + b.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

const TITLE_SIMILARITY_THRESHOLD = 0.6;
const CONTENT_SIMILARITY_THRESHOLD = 0.5;

/**
 * Semantic clause deduplication — deliberately NOT title-equality-only
 * (two clauses can restate the same rule with slightly different wording)
 * and NOT content-similarity-only (two genuinely different clauses can
 * discuss a similar topic, e.g. two distinct fees, without being
 * duplicates). A pair is only merged when BOTH the normalized title AND
 * the combined summary+plainExplanation content clear conservative
 * similarity thresholds — either signal alone is too weak. All unique
 * meaningful clauses are preserved; nothing is fabricated or invented.
 */
export function deduplicateClauses(clauses: readonly ImportantClause[]): ImportantClause[] {
  const kept: ImportantClause[] = [];

  for (const clause of clauses) {
    const clauseContent = tokenize(`${clause.summary} ${clause.plainExplanation}`);
    const isDuplicate = kept.some((existing) => {
      const titleSimilarity = jaccardSimilarity(tokenize(clause.title), tokenize(existing.title));
      if (titleSimilarity < TITLE_SIMILARITY_THRESHOLD) {
        return false;
      }
      const existingContent = tokenize(`${existing.summary} ${existing.plainExplanation}`);
      return jaccardSimilarity(clauseContent, existingContent) >= CONTENT_SIMILARITY_THRESHOLD;
    });

    if (!isDuplicate) {
      kept.push(clause);
    }
  }

  return kept;
}
