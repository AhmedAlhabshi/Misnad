import type { ContractChunk } from "../chunk/schema";

const ARABIC_DIACRITICS = /[ً-ٰٟ]/g;

/** Light, search-only normalization (never applied to stored chunk text) — folds common Arabic spelling variants so "الدفعة" and a diacritic-marked or alternate-hamza variant of the same word still match. */
function normalizeArabic(text: string): string {
  return text
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function tokenize(text: string): string[] {
  const normalized = normalizeArabic(text.toLowerCase());
  return normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

const SECTION_QUERY_PATTERNS = [
  /Article\s+([0-9]+[A-Za-z]?)/i,
  /Section\s+([0-9]+[A-Za-z]?)/i,
  /Clause\s+([0-9]+[A-Za-z]?)/i,
  /المادة\s+(\S+)/,
  /البند\s+(\S+)/,
];

/** Extracts an explicit section/clause reference from a user's query (or the caller-supplied `selectedClauseTitle`), when present. */
export function extractQueriedSectionLabel(text: string): string | null {
  for (const pattern of SECTION_QUERY_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const prefix = pattern.source.match(/^([A-Za-z]+|المادة|البند)/)?.[0] ?? "";
      return `${prefix} ${match[1]}`.trim();
    }
  }
  return null;
}

/**
 * Keyword score for one chunk against a query: a strong boost for an exact
 * section/clause match (including an explicitly-selected clause title from
 * the UI), plus one point per shared content token. Deliberately simple and
 * exact-phrase-friendly — vector search carries the semantic-similarity
 * side of the hybrid.
 */
export function keywordMatchScore(chunk: ContractChunk, queryText: string, selectedClauseTitle?: string | null): number {
  let score = 0;

  if (selectedClauseTitle && chunk.section && normalizeArabic(chunk.section.toLowerCase()) === normalizeArabic(selectedClauseTitle.toLowerCase())) {
    score += 15;
  }

  const queriedSection = extractQueriedSectionLabel(queryText);
  if (queriedSection && chunk.section && normalizeArabic(chunk.section.toLowerCase()) === normalizeArabic(queriedSection.toLowerCase())) {
    score += 10;
  }

  const terms = tokenize(queryText);
  const haystack = new Set(tokenize(`${chunk.text} ${chunk.section ?? ""}`));
  for (const term of terms) {
    if (haystack.has(term)) {
      score += 1;
    }
  }

  return score;
}
