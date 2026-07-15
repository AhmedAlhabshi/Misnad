/**
 * A small function-word stoplist (English + Arabic) shared by the fake
 * embedding provider's bag-of-words hashing and the keyword-match scorer.
 * Without this, extremely common words ("the", "of", "must", "في", "من")
 * that appear in almost every legal sentence regardless of topic would
 * dominate both the fake embedding's similarity signal and keyword match
 * counts, making an unrelated query look artificially similar to any legal
 * text purely by sharing grammar rather than meaning.
 */
const STOPWORDS = new Set([
  "the", "and", "for", "must", "shall", "any", "all", "with", "from", "this", "that",
  "are", "was", "were", "has", "have", "had", "not", "may", "can", "its", "such",
  "under", "upon", "each", "who", "which", "these", "those", "into", "than",
  "في", "من", "على", "إلى", "أن", "كل", "هذا", "هذه", "التي", "الذي", "أو", "و",
]);

export function tokenizeContentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}
