/**
 * Removes PII masking placeholder tokens (e.g. `[NATIONAL_ID]`) from
 * user-facing text and cleans up the artifacts left behind (doubled
 * spaces, empty brackets/parens, dangling separators) — used at every
 * free-text render site where AI-generated or masked-source text might
 * still contain a placeholder the model was instructed to copy through
 * verbatim (party name/identifier/notes, clause text, contract summaries,
 * any typeDetails-derived descriptor). Never reverses masking — the
 * underlying PII is not recoverable from the placeholder token, this only
 * prevents the raw token string from leaking into the UI.
 *
 * This is a best-effort cleanup, not a grammar reconstructor: it removes
 * the placeholder and the most common resulting artifacts (a lone dangling
 * separator, doubled punctuation/whitespace), but does not guarantee a
 * perfectly natural sentence when a placeholder sat in the middle of one.
 */

const KNOWN_PLACEHOLDER_TOKENS = [
  "NATIONAL_ID",
  "IQAMA",
  "PHONE",
  "EMAIL",
  "IBAN",
  "BANK_ACCOUNT",
  "COMMERCIAL_REGISTRATION",
];

/** Matches the known tokens above, plus a generic `[ALL_CAPS_WITH_UNDERSCORES]` pattern as a defensive catch-all for any future placeholder the masker introduces. */
const PLACEHOLDER_PATTERN = new RegExp(`\\[(?:${KNOWN_PLACEHOLDER_TOKENS.join("|")}|[A-Z][A-Z0-9_]{2,})\\]`, "g");

const SEPARATOR_CHARS = String.raw`,،;؛:\-–—`;

function stripPlaceholders(text: string): string {
  return text.replace(PLACEHOLDER_PATTERN, "");
}

function collapseEmptyBracketsAndParens(text: string): string {
  return text.replace(/\(\s*\)/g, "").replace(/\[\s*\]/g, "");
}

function collapseRepeatedSeparators(text: string): string {
  const repeated = new RegExp(`([${SEPARATOR_CHARS}])(?:\\s*\\1)+`, "g");
  return text.replace(repeated, "$1");
}

/** Drops a now-meaningless separator (e.g. a label's trailing colon/dash) immediately followed by terminal punctuation, e.g. "Tenant: ." -> "Tenant.". */
function dropOrphanedSeparatorBeforePunctuation(text: string): string {
  return text.replace(new RegExp(`[${SEPARATOR_CHARS}]\\s*([.,،؛])`, "g"), "$1");
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s{2,}/g, " ");
}

function trimDanglingSeparators(text: string): string {
  const leading = new RegExp(`^[\\s${SEPARATOR_CHARS}]+`);
  const trailing = new RegExp(`[\\s${SEPARATOR_CHARS}]+$`);
  return text.replace(leading, "").replace(trailing, "");
}

/**
 * Sanitizes a single piece of user-facing text: strips PII placeholder
 * tokens and cleans up the artifacts left behind. Returns `null` (never an
 * empty string) when nothing renderable remains, so callers can omit the
 * row/section entirely per the strict no-placeholder/no-empty-value rule.
 */
export function sanitizeDisplayText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  let result = stripPlaceholders(value);
  result = collapseEmptyBracketsAndParens(result);
  result = collapseRepeatedSeparators(result);
  result = dropOrphanedSeparatorBeforePunctuation(result);
  result = collapseWhitespace(result);
  result = trimDanglingSeparators(result);
  result = result.trim();

  return result.length > 0 ? result : null;
}
