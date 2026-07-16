/**
 * Search-only Arabic folding (never applied to anything stored or shown to
 * the user) so that diacritic marks and common spelling variants don't
 * cause an otherwise-identical phrase to miss a pattern. Deliberately a
 * small local copy rather than an import from `@workspace/legal-rag` or
 * `@workspace/contract-rag` — this router must not take a dependency on
 * either RAG package (it decides *whether* to call them), and the
 * normalization itself is a few lines of Unicode folding, not retrieval
 * infrastructure.
 */

/** Harakat (fatha..sukun), tanween, and the dagger alif — U+064B..U+0652, U+0670. */
const ARABIC_DIACRITICS = /[ً-ْٰ]/g;
/** Tatweel/kashida, a purely cosmetic elongation character. */
const ARABIC_TATWEEL = /ـ/g;

export function normalizeArabicText(text: string): string {
  return text
    .replace(ARABIC_DIACRITICS, "")
    .replace(ARABIC_TATWEEL, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}
