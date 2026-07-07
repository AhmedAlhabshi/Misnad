export interface PiiStatistics {
  names: number;
  nationalIds: number;
  iqamaNumbers: number;
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

/** Saudi National ID: 10 digits starting with 1 (citizens) */
const NATIONAL_ID_RE = /\b1\d{9}\b/g;

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
    phones: 0,
    emails: 0,
    ibans: 0,
    bankAccounts: 0,
  };

  let text = rawText;

  // Apply masks in specificity order ------------------------------------------

  // 1. IBAN (longest / most specific — do first to protect SA-prefixed digits)
  [text, stats.ibans] = countAndReplace(text, IBAN_RE, "[IBAN]");

  // 2. Saudi National ID
  [text, stats.nationalIds] = countAndReplace(text, NATIONAL_ID_RE, "[NATIONAL_ID]");

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
