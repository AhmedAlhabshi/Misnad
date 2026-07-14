export interface PiiStatistics {
  names: number;
  nationalIds: number;
  iqamaNumbers: number;
  /** A business's commercial registration number — not a natural person's PII, but masked anyway (see `maskNationalIdFamily`) since it identifies a specific entity and the analysis never needs the literal digits. */
  commercialRegistrations: number;
  phones: number;
  emails: number;
  ibans: number;
  bankAccounts: number;
}

export interface MaskedDocument {
  maskedText: string;
  statistics: PiiStatistics;
}

// ---------------------------------------------------------------------------
// Detection patterns (ordered from most-specific to least-specific so that
// broader patterns don't consume tokens that belong to narrower ones)
// ---------------------------------------------------------------------------

/** Saudi IBAN: SA + 2 check digits + 20 alphanumeric BBAN chars = 24 chars total */
const IBAN_RE = /\bSA\d{2}[0-9A-Z]{20}\b/gi;

/**
 * Saudi National ID: 10 digits starting with 1 (citizens). Saudi commercial
 * registration numbers are also 10 digits and, for many regions (e.g.
 * Riyadh CRs start "10..."), also start with 1 — so this pattern alone
 * cannot tell a customer's national ID apart from a business's CR number.
 * `maskNationalIdFamily` below disambiguates using nearby context labels
 * before falling back to this pattern's plain digit-shape assumption.
 */
const NATIONAL_ID_RE = /\b1\d{9}\b/g;

/** Case-insensitive Latin matches use `\b` word boundaries so "cr" never matches inside an unrelated word; the Arabic phrases are specific multi-word labels unlikely to occur as substrings of something else. */
const CONTEXT_LABEL_PATTERNS: ReadonlyArray<{ category: "commercial_registration" | "national_id" | "iqama"; pattern: RegExp }> = [
  { category: "commercial_registration", pattern: /السجل التجاري|سجل تجاري|commercial registration|\bcr\b/gi },
  { category: "national_id", pattern: /الهوية الوطنية|رقم الهوية|\bnational id\b/gi },
  { category: "iqama", pattern: /رقم الإقامة|إقامة|\biqama\b/gi },
];

/** A label directly preceding its value ("Label: 123..." / "Label\n123...") is by far the dominant real-world convention, so a preceding label within this many characters is always preferred over anything found after the number. */
const PRECEDING_CONTEXT_WINDOW_CHARS = 60;
/** Only consulted when no preceding label was found at all — covers the rarer "123... (Label)" convention. Kept short to avoid bleeding into the next unrelated field. */
const FOLLOWING_CONTEXT_WINDOW_CHARS = 40;

type ContextLabelCategory = "commercial_registration" | "national_id" | "iqama";

/**
 * Scans `window` for every context label match and returns whichever one is
 * closest to the edge nearest the number — the *last* match when `window` is
 * the text immediately before the number (so the label right next to it
 * wins over an earlier, unrelated one further back), or the *first* match
 * when `window` is the text immediately after it.
 */
function findClosestLabelInWindow(window: string, preferLast: boolean): ContextLabelCategory | null {
  let bestCategory: ContextLabelCategory | null = null;
  let bestIndex = preferLast ? -1 : Infinity;

  for (const { category, pattern } of CONTEXT_LABEL_PATTERNS) {
    pattern.lastIndex = 0;
    let labelMatch: RegExpExecArray | null;
    while ((labelMatch = pattern.exec(window)) !== null) {
      const isBetter = preferLast ? labelMatch.index > bestIndex : labelMatch.index < bestIndex;
      if (isBetter) {
        bestIndex = labelMatch.index;
        bestCategory = category;
      }
    }
  }

  return bestCategory;
}

/**
 * Finds whichever context label (commercial registration / national ID /
 * Iqama indicator) is associated with the number at `matchStart..matchEnd`
 * in `text`. A label immediately *before* the number always wins when one
 * exists (the dominant "Label: value" / "Label\nvalue" convention used by
 * real contracts) — only when nothing precedes it does a label *after* the
 * number get considered. This directional preference matters: a document
 * with two labeled numbers close together (e.g. a CR number followed
 * shortly by a national ID) must never let the second field's label bleed
 * backwards onto the first field's number just because it happens to be
 * textually nearby. Returns `null` when no label appears nearby at all.
 */
function findNearestContextLabel(text: string, matchStart: number, matchEnd: number): ContextLabelCategory | null {
  const precedingWindow = text.slice(Math.max(0, matchStart - PRECEDING_CONTEXT_WINDOW_CHARS), matchStart);
  const preceding = findClosestLabelInWindow(precedingWindow, true);
  if (preceding !== null) {
    return preceding;
  }

  const followingWindow = text.slice(matchEnd, Math.min(text.length, matchEnd + FOLLOWING_CONTEXT_WINDOW_CHARS));
  return findClosestLabelInWindow(followingWindow, false);
}

/**
 * Masks every 10-digit, 1-prefixed number as either `[COMMERCIAL_REGISTRATION]`
 * or `[NATIONAL_ID]`, deciding per-match from nearby context labels rather
 * than a single blind pattern. When no context label is found nearby at all,
 * it defaults to `[NATIONAL_ID]` — the same behavior this masker always
 * had — so an actual national ID with no surrounding label is never left
 * unmasked or under-protected by this change.
 */
function maskNationalIdFamily(text: string): { text: string; nationalIds: number; commercialRegistrations: number } {
  let nationalIds = 0;
  let commercialRegistrations = 0;
  const masked = text.replace(NATIONAL_ID_RE, (match, offset: number) => {
    const category = findNearestContextLabel(text, offset, offset + match.length);
    if (category === "commercial_registration") {
      commercialRegistrations++;
      return "[COMMERCIAL_REGISTRATION]";
    }
    nationalIds++;
    return "[NATIONAL_ID]";
  });
  return { text: masked, nationalIds, commercialRegistrations };
}

/** Iqama number: 10 digits starting with 2 (residents) */
const IQAMA_RE = /\b2\d{9}\b/g;

/**
 * Saudi phone numbers:
 *   +966 5X XXXXXXX  |  00966 5X XXXXXXX  |  05X XXXXXXX  |  5X XXXXXXX
 * Allows optional spaces/hyphens between groups.
 */
const PHONE_RE =
  /(?:\+966|00966|0)[\s-]?5\d[\s-]?\d{3}[\s-]?\d{4}|\b5\d[\s-]?\d{3}[\s-]?\d{4}\b/g;

/** Standard email addresses */
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/**
 * Bank account numbers: sequences of 10–24 digits that were not already
 * consumed by IBAN, National ID, or Iqama patterns. We require word
 * boundaries to avoid matching parts of longer numbers.
 */
const BANK_ACCOUNT_RE = /\b\d{10,24}\b/g;

// ---------------------------------------------------------------------------
// Masking helpers
// ---------------------------------------------------------------------------

function countAndReplace(
  text: string,
  pattern: RegExp,
  placeholder: string,
): [string, number] {
  let count = 0;
  const result = text.replace(pattern, () => {
    count++;
    return placeholder;
  });
  return [result, count];
}

// ---------------------------------------------------------------------------
// Public service function
// ---------------------------------------------------------------------------

export function maskPii(rawText: string): MaskedDocument {
  const stats: PiiStatistics = {
    names: 0,        // requires NLP/NER — kept at 0 for regex-only milestone
    nationalIds: 0,
    iqamaNumbers: 0,
    commercialRegistrations: 0,
    phones: 0,
    emails: 0,
    ibans: 0,
    bankAccounts: 0,
  };

  let text = rawText;

  // Apply masks in specificity order ------------------------------------------

  // 1. IBAN (longest / most specific — do first to protect SA-prefixed digits)
  [text, stats.ibans] = countAndReplace(text, IBAN_RE, "[IBAN]");

  // 2. Saudi National ID vs. commercial registration (both 10 digits, both
  // can start with 1 — disambiguated by nearby context labels; see
  // `maskNationalIdFamily`).
  {
    const result = maskNationalIdFamily(text);
    text = result.text;
    stats.nationalIds = result.nationalIds;
    stats.commercialRegistrations = result.commercialRegistrations;
  }

  // 3. Iqama (also 10 digits starting with 2 — after National ID to avoid overlap)
  [text, stats.iqamaNumbers] = countAndReplace(text, IQAMA_RE, "[IQAMA]");

  // 4. Phone numbers
  [text, stats.phones] = countAndReplace(text, PHONE_RE, "[PHONE]");

  // 5. Email addresses
  [text, stats.emails] = countAndReplace(text, EMAIL_RE, "[EMAIL]");

  // 6. Bank account numbers (catch remaining 10–24 digit runs)
  [text, stats.bankAccounts] = countAndReplace(text, BANK_ACCOUNT_RE, "[BANK_ACCOUNT]");

  return { maskedText: text, statistics: stats };
}
