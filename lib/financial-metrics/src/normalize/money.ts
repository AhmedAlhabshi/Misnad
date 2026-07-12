const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ARABIC_THOUSANDS_SEPARATOR = /٬/g; // ٬
const ARABIC_DECIMAL_SEPARATOR = /٫/g; // ٫
const CURRENCY_TOKEN_PATTERN = /^[A-Za-z]{3}$/;

function convertArabicIndicDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)));
}

/** Common currency names/symbols mapped to their ISO-4217-style code. Never guessed — unmapped text resolves to `null`. */
const CURRENCY_TEXT_ALIASES: Record<string, string> = {
  sar: "SAR",
  sr: "SAR",
  "saudi riyal": "SAR",
  "saudi riyals": "SAR",
  "ريال": "SAR",
  "ريال سعودي": "SAR",
  "ر.س": "SAR",
  usd: "USD",
  "$": "USD",
  "us dollar": "USD",
  "us dollars": "USD",
  "دولار": "USD",
  eur: "EUR",
  "€": "EUR",
  euro: "EUR",
  "يورو": "EUR",
  gbp: "GBP",
  "£": "GBP",
  pound: "GBP",
  aed: "AED",
  "درهم": "AED",
};

/**
 * Maps free text (as found in `ContractUnderstanding`'s untyped `currency`
 * fields) to a 3-letter ISO-style code. Returns `null` — never a guessed or
 * default code — when the text cannot be confidently mapped.
 */
export function normalizeCurrencyCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (CURRENCY_TOKEN_PATTERN.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return CURRENCY_TEXT_ALIASES[trimmed.toLowerCase()] ?? null;
}

export interface ParsedMoneyString {
  value: number;
  currency: string | null;
}

/**
 * Parses a free-text monetary string such as "10,000.50", "١٠٬٠٠٠٫٥٠",
 * "10000 SAR", or "SAR 10000" into a finite number and an optional
 * currency code. Returns `null` for anything that cannot be confidently
 * parsed as a number — this never guesses a value from arbitrary text, and
 * never produces `NaN`/`Infinity` (a strict digit-pattern check runs after
 * cleanup, rejecting stray words such as "Infinity" or "NaN" outright).
 */
export function parseMoneyString(raw: string): ParsedMoneyString | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const tokens = trimmed.split(/\s+/);
  let currency: string | null = null;
  let numericTokens = tokens;

  if (tokens.length > 1 && CURRENCY_TOKEN_PATTERN.test(tokens[0])) {
    currency = tokens[0].toUpperCase();
    numericTokens = tokens.slice(1);
  } else if (tokens.length > 1 && CURRENCY_TOKEN_PATTERN.test(tokens[tokens.length - 1])) {
    currency = tokens[tokens.length - 1].toUpperCase();
    numericTokens = tokens.slice(0, -1);
  }

  const numericPart = numericTokens.join(" ").trim();
  if (numericPart.length === 0) {
    return null;
  }

  const asciiDigits = convertArabicIndicDigits(numericPart)
    .replace(ARABIC_THOUSANDS_SEPARATOR, "")
    .replace(ARABIC_DECIMAL_SEPARATOR, ".")
    .replace(/,/g, "");

  if (!/^-?\d+(\.\d+)?$/.test(asciiDigits)) {
    return null;
  }

  const value = Number(asciiDigits);
  if (!Number.isFinite(value)) {
    return null;
  }

  return { value, currency };
}

/**
 * Validates an already-numeric amount (as `ContractUnderstanding`'s typed
 * `number | null` fields always are, having already passed Zod validation
 * upstream). Rejects `NaN`/`Infinity` defensively; never coerces `null`/
 * `undefined` to `0`.
 */
export function sanitizeNumericAmount(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number.isFinite(value) ? value : null;
}
