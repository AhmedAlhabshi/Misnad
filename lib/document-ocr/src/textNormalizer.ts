/**
 * Conservative, deterministic clean-up applied to OCR output before PII
 * masking — never AI-based, never guesses missing words, never rewrites or
 * replaces recognized text. Only removes clutter that OCR/PDF rendering
 * commonly introduces (stray control characters, inconsistent line endings,
 * runs of blank lines/spaces) while preserving everything PII masking and
 * downstream analysis depend on: digits, currency symbols, percentages,
 * dates, IBANs, national ID/Iqama numbers, and phone numbers, plus the
 * `--- PAGE N ---` separators inserted by the OCR page-merge step.
 */

const PAGE_SEPARATOR_RE = /^--- PAGE \d+ ---$/;

/** C0/C1 control characters except tab, newline, and carriage return — never touches printable text, digits, or symbols. */
const STRIP_CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;

/** Zero-width and other invisible-but-not-whitespace formatting characters that add no information and can interfere with pattern matching (e.g. an IBAN split by a zero-width space). */
const INVISIBLE_FORMATTING_CHARS_RE = /[\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}\u{FEFF}]/gu;

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripInvisibleAndControlChars(text: string): string {
  return text.replace(STRIP_CONTROL_CHARS_RE, "").replace(INVISIBLE_FORMATTING_CHARS_RE, "");
}

/** Collapses runs of horizontal whitespace (spaces/tabs) within a line to a single space — never touches the newline itself, so line/page structure is preserved. */
function collapseHorizontalWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => (PAGE_SEPARATOR_RE.test(line.trim()) ? line.trim() : line.replace(/[ \t]+/g, " ").trimEnd()))
    .join("\n");
}

/** Collapses 3+ consecutive blank lines down to exactly one blank line (a paragraph break), never removing single blank lines that separate genuine paragraphs. */
function collapseExcessiveBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

/**
 * Normalizes OCR (or native) extracted text before PII masking. Every step
 * here is a pure removal/collapse of non-content clutter — nothing is
 * reworded, translated, corrected, or guessed, and no numeric, currency,
 * date, or identifier content is ever altered.
 */
export function normalizeOcrText(text: string): string {
  let result = text;
  result = normalizeLineEndings(result);
  result = stripInvisibleAndControlChars(result);
  result = collapseHorizontalWhitespace(result);
  result = collapseExcessiveBlankLines(result);
  return result.trim();
}
