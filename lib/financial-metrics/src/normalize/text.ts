import type { PaymentFrequency } from "../enums";

/**
 * Strips a leading Arabic definite article ("ال") from the start of each
 * word. Real contract text uses the definite article inconsistently (e.g.
 * "الدفعة المقدمة" vs "دفعة مقدمة" for the same concept, "down payment"), so
 * without this a keyword list written one way silently fails to match text
 * written the other way — this is a general Arabic-text concern, not tied to
 * any specific keyword or contract type.
 */
function stripArabicDefiniteArticles(text: string): string {
  return text.replace(/(^|\s)ال(?=\S)/g, "$1");
}

/** Collapses whitespace and case, and normalizes the Arabic definite article, for reliable, deterministic keyword/label matching. */
export function normalizeLabel(raw: string | null | undefined): string {
  if (typeof raw !== "string") {
    return "";
  }
  return stripArabicDefiniteArticles(raw.trim().toLowerCase().replace(/\s+/g, " "));
}

/**
 * Both `text` and every `keyword` are normalized identically (including
 * definite-article stripping) before matching — a keyword written without
 * "ال" (e.g. "دفعة مقدمة") must still match text that uses it (e.g. "الدفعة
 * المقدمة"), and vice versa.
 */
export function containsAnyKeyword(text: string, keywords: readonly string[]): boolean {
  const normalized = normalizeLabel(text);
  return keywords.some((keyword) => normalized.includes(normalizeLabel(keyword)));
}

/**
 * Token-overlap (Jaccard) similarity in [0, 1] between two free-text labels.
 * Used only to help decide, during deduplication, whether two candidates
 * plausibly describe the same underlying item — it never alters or invents
 * an amount.
 */
export function labelSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeLabel(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeLabel(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection += 1;
    }
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

const FREQUENCY_KEYWORDS: ReadonlyArray<{ frequency: PaymentFrequency; keywords: readonly string[] }> = [
  { frequency: "daily", keywords: ["daily", "per day", "يوميا", "يومي"] },
  { frequency: "weekly", keywords: ["weekly", "per week", "أسبوعيا", "أسبوعي"] },
  { frequency: "monthly", keywords: ["monthly", "per month", "شهريا", "شهري", "شهريًا"] },
  { frequency: "quarterly", keywords: ["quarterly", "every quarter", "ربع سنوي", "ربعي", "كل ثلاثة أشهر"] },
  { frequency: "semi_annual", keywords: ["semi-annual", "semiannual", "twice a year", "نصف سنوي", "كل ستة أشهر"] },
  { frequency: "annual", keywords: ["annual", "yearly", "per year", "سنويا", "سنوي", "سنويًا"] },
  { frequency: "one_time", keywords: ["one time", "one-time", "single payment", "upfront", "دفعة واحدة", "لمرة واحدة"] },
  { frequency: "irregular", keywords: ["irregular", "as needed", "variable", "غير منتظم"] },
];

/**
 * Maps a free-text frequency description (as found in
 * `financialObligations[].frequency`, `subscriptionDetails.billingFrequency`,
 * `insuranceDetails.premiumFrequency`, `employmentDetails.salaryFrequency`)
 * to the closed `PaymentFrequency` enum. Returns `null` — never a guessed
 * default — when the text does not clearly match a known frequency.
 */
export function classifyFrequencyText(raw: string | null | undefined): PaymentFrequency | null {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = normalizeLabel(raw);
  if (normalized.length === 0) {
    return null;
  }
  for (const { frequency, keywords } of FREQUENCY_KEYWORDS) {
    if (containsAnyKeyword(normalized, keywords)) {
      return frequency;
    }
  }
  return null;
}
