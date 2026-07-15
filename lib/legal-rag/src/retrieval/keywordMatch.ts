import type { LegalChunk } from "../chunk/schema";
import { tokenizeContentWords } from "./textTokens";

const ARTICLE_QUERY_EN = /Article\s+([0-9]+[A-Za-z]?)/i;
const ARTICLE_QUERY_AR = /المادة\s+(\S+)/;

/** Extracts an explicit article/section reference from a user's query text, when present. */
export function extractQueriedArticleNumber(text: string): string | null {
  const en = ARTICLE_QUERY_EN.exec(text);
  if (en) return `Article ${en[1]}`;
  const ar = ARTICLE_QUERY_AR.exec(text);
  if (ar) return `المادة ${ar[1]}`;
  return null;
}

/** Strong boost for an exact article/section-number match, plus one point per matched content keyword — deliberately simple and exact-phrase-friendly rather than semantic (that's what vector search is for). */
export function keywordMatchScore(chunk: LegalChunk, queryText: string): number {
  let score = 0;

  const queriedArticle = extractQueriedArticleNumber(queryText);
  if (queriedArticle && chunk.articleNumber && chunk.articleNumber.toLowerCase() === queriedArticle.toLowerCase()) {
    score += 10;
  }

  const terms = tokenizeContentWords(queryText);
  const haystack = new Set(tokenizeContentWords(`${chunk.text} ${chunk.articleNumber ?? ""} ${chunk.documentTitle}`));
  for (const term of terms) {
    if (haystack.has(term)) {
      score += 1;
    }
  }

  return score;
}
