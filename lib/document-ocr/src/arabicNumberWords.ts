/**
 * Focused Arabic number-word parser for monetary/duration amounts found in
 * financial contracts (e.g. "مائة وعشرون ألف ريال" = 120,000) — deliberately
 * not a general NLP number system. Arabic spells compound numbers
 * additively (hundreds + tens/teens + ones), with "ألف" (thousand) acting as
 * a multiplier over whatever preceded it in the same segment, and anything
 * after a thousand marker adding on top rather than multiplying again.
 *
 * Dictionaries below are written in their natural/common spelling exactly
 * once; every lookup (both the dictionary keys and the input tokens) goes
 * through the same `normalizeForLookup` function at call time, so a
 * hand-typing mistake in the normalization logic can never silently create
 * a mismatched dictionary key — there is only one place spelling variants
 * (hamza forms, taa marbuta) are handled.
 */

const DIACRITICS_RE = /[ً-ْٰ]/g;

/** Collapses every hamza-bearing letter form (أ إ آ ئ ؤ ء) to a bare alef/its carrier, and taa marbuta (ة) to haa (ه) — purely for dictionary lookup, never applied to text returned to callers. */
function normalizeForLookup(word: string): string {
  return word
    .replace(DIACRITICS_RE, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ء/g, "")
    .replace(/ة/g, "ه")
    .trim();
}

function buildNormalizedDict(entries: Record<string, number>): Record<string, number> {
  const normalized: Record<string, number> = {};
  for (const [key, value] of Object.entries(entries)) {
    normalized[normalizeForLookup(key)] = value;
  }
  return normalized;
}

/** Values 1–9, natural spelling. "واحد"/"أحد" both accepted (the latter is the construct form used inside "أحد عشر"). */
const ONES = buildNormalizedDict({
  صفر: 0,
  واحد: 1,
  أحد: 1,
  اثنان: 2,
  اثنين: 2,
  ثلاثة: 3,
  أربعة: 4,
  خمسة: 5,
  ستة: 6,
  سبعة: 7,
  ثمانية: 8,
  تسعة: 9,
});

/** The teen-suffix modifier "عشر" (no taa marbuta) means "+10" and only ever follows a ones-word (1–9) to form 11–19. Bare "عشرة" (with taa marbuta) is the standalone value 10. */
const TEEN_SUFFIX = normalizeForLookup("عشر");
const TEN_STANDALONE = buildNormalizedDict({ عشرة: 10 });

/** Multiples of ten, 20–90 (nominative and accusative/genitive forms both accepted). */
const TENS = buildNormalizedDict({
  عشرون: 20,
  عشرين: 20,
  ثلاثون: 30,
  ثلاثين: 30,
  أربعون: 40,
  أربعين: 40,
  خمسون: 50,
  خمسين: 50,
  ستون: 60,
  ستين: 60,
  سبعون: 70,
  سبعين: 70,
  ثمانون: 80,
  ثمانين: 80,
  تسعون: 90,
  تسعين: 90,
});

/** Hundreds, 100–900. "مئة"/"مائة" and "مئتان"/"مائتان" spelling variants both normalize to the same keys. */
const HUNDREDS = buildNormalizedDict({
  مائة: 100,
  مئة: 100,
  مائتان: 200,
  مئتان: 200,
  مائتين: 200,
  مئتين: 200,
  ثلاثمائة: 300,
  ثلاثمئة: 300,
  أربعمائة: 400,
  أربعمئة: 400,
  خمسمائة: 500,
  خمسمئة: 500,
  ستمائة: 600,
  ستمئة: 600,
  سبعمائة: 700,
  سبعمئة: 700,
  ثمانمائة: 800,
  ثمانمئة: 800,
  تسعمائة: 900,
  تسعمئة: 900,
});

/** "ألفان"/"ألفين" is the literal value 2000, standing alone (not a multiplier over a preceding segment). Every other thousand spelling variant ("ألف"/"ألفا"/"ألفاً"/"آلاف"/"الاف") normalizes to the same key, which multiplies the accumulated segment sum (or is 1000 on its own). */
const THOUSAND_PAIR_KEYS = new Set([normalizeForLookup("ألفان"), normalizeForLookup("ألفين")]);
const THOUSAND_MARKER_KEYS = new Set([
  normalizeForLookup("ألف"),
  normalizeForLookup("ألفا"),
  normalizeForLookup("ألفاً"),
  normalizeForLookup("آلاف"),
  normalizeForLookup("الاف"),
]);

/** Marks a percentage rather than a monetary/count amount — "خمسة بالمائة", "5%", "5 بالمئة", "في المئة". */
const PERCENT_MARKERS = ["بالمائة", "بالمئة", "في المائة", "في المئة", "%", "٪"].map(normalizeForLookup);

export interface ArabicNumberWordResult {
  /** The parsed integer value. */
  value: number;
  /** True when a percent marker was found alongside the number words. */
  isPercentage: boolean;
  /** The exact original (unnormalized) substring that was parsed — kept for evidence/provenance, never altered. */
  matchedText: string;
}

/** Tokens that carry no numeric meaning but commonly appear alongside amount-in-words phrases — skipped rather than treated as unrecognized/parse-failing. */
const IGNORED_TOKENS = new Set(
  [
    "ريال",
    "ريالاً",
    "ريالات",
    "سعودي",
    "سعودية",
    "فقط",
    "لا",
    "غير",
    "تماماً",
    "شهرياً",
    "سنوياً",
    "شهراً",
    "شهور",
    "أشهر",
    "سنة",
    "سنوات",
    "و",
  ].map(normalizeForLookup),
);

function stripLeadingConjunction(word: string): string {
  if (word.length > 1 && word.startsWith("و")) {
    const stripped = word.slice(1);
    // Only strip when the remainder is itself a recognizable number word —
    // otherwise a genuine word that happens to start with "و" (e.g. "واحد") stays intact.
    if (
      stripped in ONES ||
      stripped in TENS ||
      stripped in HUNDREDS ||
      stripped in TEN_STANDALONE ||
      THOUSAND_MARKER_KEYS.has(stripped) ||
      THOUSAND_PAIR_KEYS.has(stripped) ||
      stripped === TEEN_SUFFIX
    ) {
      return stripped;
    }
  }
  return word;
}

/**
 * Parses a single Arabic number-word phrase (e.g. "تسعة عشر ألفاً ومائتان")
 * into an integer. Returns `null` when the phrase contains no recognizable
 * number words at all — this never guesses a value from unrelated text.
 */
export function parseArabicNumberWords(rawText: string): ArabicNumberWordResult | null {
  const hasPercentMarker = PERCENT_MARKERS.some((marker) => normalizeForLookup(rawText).includes(marker));
  const tokens = rawText
    .replace(/[،,()]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  let total = 0;
  let segmentSum = 0;
  let matchedAnyNumberWord = false;

  for (const rawToken of tokens) {
    const normalizedToken = normalizeForLookup(rawToken);
    if (normalizedToken.length === 0 || IGNORED_TOKENS.has(normalizedToken) || PERCENT_MARKERS.includes(normalizedToken)) {
      continue;
    }

    const word = stripLeadingConjunction(normalizedToken);

    if (word in ONES) {
      segmentSum += ONES[word];
      matchedAnyNumberWord = true;
    } else if (word === TEEN_SUFFIX) {
      segmentSum += 10;
      matchedAnyNumberWord = true;
    } else if (word in TEN_STANDALONE) {
      segmentSum += TEN_STANDALONE[word];
      matchedAnyNumberWord = true;
    } else if (word in TENS) {
      segmentSum += TENS[word];
      matchedAnyNumberWord = true;
    } else if (word in HUNDREDS) {
      segmentSum += HUNDREDS[word];
      matchedAnyNumberWord = true;
    } else if (THOUSAND_PAIR_KEYS.has(word)) {
      total += 2000;
      segmentSum = 0;
      matchedAnyNumberWord = true;
    } else if (THOUSAND_MARKER_KEYS.has(word)) {
      const multiplier = segmentSum > 0 ? segmentSum : 1;
      total += multiplier * 1000;
      segmentSum = 0;
      matchedAnyNumberWord = true;
    }
    // Unrecognized tokens (currency names, filler words) are silently skipped — never treated as a parse failure on their own.
  }

  if (!matchedAnyNumberWord) {
    return null;
  }

  return {
    value: total + segmentSum,
    isPercentage: hasPercentMarker,
    matchedText: rawText,
  };
}

/**
 * Finds every parenthesized amount-in-words phrase in `text` (the common
 * Saudi contract convention "٠ ريال سعودي (مائة وعشرون ألف ريال فقط)") and
 * returns each one that successfully parses as a number. Never returns a
 * phrase that failed to parse.
 */
export function extractParentheticalAmountWords(text: string): ArabicNumberWordResult[] {
  const results: ArabicNumberWordResult[] = [];
  const parenRe = /\(([^()]{2,120})\)/g;
  let match: RegExpExecArray | null;
  while ((match = parenRe.exec(text)) !== null) {
    const parsed = parseArabicNumberWords(match[1]);
    if (parsed !== null) {
      results.push(parsed);
    }
  }
  return results;
}
