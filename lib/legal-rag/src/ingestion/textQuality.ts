/**
 * A lightweight, dedicated text-quality check for curated legal source
 * files — deliberately not a reuse of `@workspace/document-ocr`'s
 * `evaluateTextQuality`, whose heuristics are keyed to OCR page-count
 * ratios that don't transfer to a plain curated text file with no page
 * concept. This check exists for the same underlying reason that one does:
 * never silently ingest corrupted/mojibake text.
 */
export interface LegalTextQualityResult {
  ok: boolean;
  reason: string | null;
}

const MIN_LENGTH = 40;
/** The Unicode replacement character — its presence is a strong, unambiguous signal of a failed decode. */
const REPLACEMENT_CHAR = "�";
const MAX_REPLACEMENT_RATIO = 0.001;
/** Below this printable-character ratio, text is treated as corrupted rather than genuinely short. */
const MIN_PRINTABLE_RATIO = 0.85;

export function validateLegalTextQuality(text: string): LegalTextQualityResult {
  const trimmed = text.trim();
  if (trimmed.length < MIN_LENGTH) {
    return { ok: false, reason: `text is shorter than the minimum ${MIN_LENGTH} characters` };
  }

  const replacementCount = (trimmed.match(new RegExp(REPLACEMENT_CHAR, "gu")) ?? []).length;
  if (replacementCount / trimmed.length > MAX_REPLACEMENT_RATIO) {
    return { ok: false, reason: "text contains an excessive ratio of Unicode replacement characters (failed decode)" };
  }

  // Printable: letters (incl. Arabic), numbers, common punctuation, and whitespace.
  const printableMatches = trimmed.match(/[\p{L}\p{N}\p{P}\s]/gu) ?? [];
  const printableRatio = printableMatches.length / trimmed.length;
  if (printableRatio < MIN_PRINTABLE_RATIO) {
    return { ok: false, reason: "text has an unexpectedly low printable-character ratio (possible corrupted/mojibake extraction)" };
  }

  return { ok: true, reason: null };
}
