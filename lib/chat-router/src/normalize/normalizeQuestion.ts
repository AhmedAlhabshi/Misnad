import { normalizeArabicText } from "./arabic";
import { normalizeEnglishText } from "./english";

/**
 * One shared normalization pipeline applied to both the incoming question
 * and every pattern phrase compared against it (see
 * `signals/patterns.ts`'s `phrase()` helper), so both sides are folded
 * identically and a hand-typed pattern never silently drifts out of sync
 * with the runtime text it's matched against.
 *
 * Order matters: case-folding first (harmless for Arabic, required for
 * English), then Arabic diacritic/spelling folding, then punctuation
 * stripped to spaces (keeps Arabic "؟" and Latin "?" from merging two
 * words), then whitespace collapsed. The result is a single
 * space-separated lowercase string with no punctuation — safe to use with
 * plain `.includes()` substring checks for every pattern phrase.
 */
export function normalizeQuestion(question: string): string {
  const caseFolded = normalizeEnglishText(question);
  const arabicFolded = normalizeArabicText(caseFolded);
  const punctuationStripped = arabicFolded.replace(/[^\p{L}\p{N}\s]/gu, " ");
  return punctuationStripped.replace(/\s+/g, " ").trim();
}
