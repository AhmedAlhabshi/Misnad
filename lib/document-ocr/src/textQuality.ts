import { recoverFinancialValues } from "./financialTextRecovery";
import type { DocumentTextQuality, FinancialIntegrityMetrics, FinancialIntegrityResult, TextQualityResult } from "./types";

/**
 * Every threshold used by `evaluateTextQuality`, gathered in one place so
 * they can be tuned without hunting through the scoring logic. None of this
 * is language-specific to a single Arabic or English word — a mis-decoded
 * contract can be in either language, so detection relies only on
 * character-class ratios, mojibake byte patterns, and structural signals
 * (density, repetition, replacement characters) that hold regardless of
 * which language(s) the contract is actually written in.
 */
export const TEXT_QUALITY_THRESHOLDS = {
  /** Below this many non-whitespace characters total, there is nothing meaningful to score. */
  MIN_MEANINGFUL_CHARACTERS: 20,

  /** Characters-per-page below this is a strong "likely scanned, little/no real text" signal. */
  CHARS_PER_PAGE_POOR: 40,
  /** Characters-per-page at or above this is treated as a normal, text-rich page. */
  CHARS_PER_PAGE_GOOD: 200,

  /** `readableCharacterRatio` below this is treated as poor. */
  READABLE_RATIO_POOR: 0.55,
  /** `readableCharacterRatio` at or above this is treated as good. */
  READABLE_RATIO_GOOD: 0.85,

  /** `suspiciousSymbolRatio` at or above this alone is enough to call the text poor. */
  SUSPICIOUS_RATIO_POOR: 0.25,
  /** `suspiciousSymbolRatio` at or above this is noticeable but not fatal on its own. */
  SUSPICIOUS_RATIO_PARTIAL: 0.08,

  /** `mojibakeRatio` at or above this is a near-certain UTF-8-as-Latin1 mis-decode. */
  MOJIBAKE_RATIO_POOR: 0.015,
  /** `mojibakeRatio` at or above this is worth a warning even if not (yet) fatal. */
  MOJIBAKE_RATIO_PARTIAL: 0.004,

  /** Any replacement character (`U+FFFD`) at all is a sign of a failed/partial decode. */
  REPLACEMENT_CHAR_RATIO_POOR: 0.01,
  REPLACEMENT_CHAR_RATIO_PARTIAL: 0.001,

  /** A single non-alphanumeric symbol repeated this much of the whole text signals garbage/noise, not prose. */
  MAX_SINGLE_SYMBOL_FREQUENCY_POOR: 0.2,
  MAX_SINGLE_SYMBOL_FREQUENCY_PARTIAL: 0.1,

  /** Share of whitespace-separated tokens that must look like real words/numbers for the text to read as prose. */
  READABLE_TOKEN_RATIO_POOR: 0.35,
  READABLE_TOKEN_RATIO_PARTIAL: 0.6,

  /** Final 0–100 score cutoffs for the three quality buckets. */
  SCORE_GOOD: 75,
  SCORE_POOR: 40,
  /** Within the "partial" band, scores below this still lean toward running OCR. */
  SCORE_PARTIAL_LEAN_OCR: 60,
} as const;

/**
 * Every character-class range below is written as an explicit `\u{...}`
 * code point escape (with the regex `u` flag) rather than as a literal
 * exotic/right-to-left character in the source — literal Arabic-range
 * characters embedded directly in a regex are easy to mistype invisibly
 * and hard to review in a diff.
 */

/** `Ù`, `Ø`, `Ã`, `Â` — the classic markers left behind when UTF-8 Arabic text is mis-decoded as Latin-1/Windows-1252. */
const MOJIBAKE_MARKER_RE = /[ÙØÃÂ]/;

/** Arabic + Arabic Supplement + Arabic Extended-A + Arabic Presentation Forms A/B. */
const ARABIC_LETTER_RE =
  /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/u;

const LATIN_LETTER_RE = /[A-Za-z]/;

/** ASCII digits + Arabic-Indic digits + Extended (Persian) Arabic-Indic digits. */
const DIGIT_RE = /[0-9٠-٩۰-۹]/u;

/**
 * Punctuation/currency/percent symbols that are legitimate contract
 * content, not noise: ASCII punctuation, Arabic comma/semicolon/question
 * mark, Arabic percent sign, and the Saudi riyal sign.
 */
const COMMON_READABLE_SYMBOL_RE =
  /[.,;:!?()\-–—/\\'"«»%$&@#+*=،؛؟٪﷼]/u;

/** C0 controls, DEL, and C1 controls — real whitespace is already stripped before this runs. */
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F-\x9F]/;

/** Unicode replacement character — always a sign of a failed/partial decode. */
const REPLACEMENT_CHARACTER = "�";

interface ClassificationCounts {
  arabic: number;
  latin: number;
  digit: number;
  commonSymbol: number;
  mojibakeMarkers: number;
  replacementChars: number;
  control: number;
  other: number;
}

function classifyCharacters(meaningfulText: string): ClassificationCounts {
  const counts: ClassificationCounts = {
    arabic: 0,
    latin: 0,
    digit: 0,
    commonSymbol: 0,
    mojibakeMarkers: 0,
    replacementChars: 0,
    control: 0,
    other: 0,
  };

  for (const char of meaningfulText) {
    if (char === REPLACEMENT_CHARACTER) {
      counts.replacementChars++;
      continue;
    }
    if (CONTROL_CHAR_RE.test(char)) {
      counts.control++;
      continue;
    }
    if (MOJIBAKE_MARKER_RE.test(char)) {
      counts.mojibakeMarkers++;
      counts.other++;
      continue;
    }
    if (ARABIC_LETTER_RE.test(char)) {
      counts.arabic++;
      continue;
    }
    if (LATIN_LETTER_RE.test(char)) {
      counts.latin++;
      continue;
    }
    if (DIGIT_RE.test(char)) {
      counts.digit++;
      continue;
    }
    if (COMMON_READABLE_SYMBOL_RE.test(char)) {
      counts.commonSymbol++;
      continue;
    }
    counts.other++;
  }

  return counts;
}

/** Highest share any single non-alphanumeric, non-common-punctuation character holds of the whole text — a proxy for "abnormal repetition of a symbol". */
function maxSuspiciousSymbolFrequencyRatio(meaningfulText: string): number {
  const frequencies = new Map<string, number>();
  let suspiciousTotal = 0;

  for (const char of meaningfulText) {
    const isOrdinary =
      ARABIC_LETTER_RE.test(char) ||
      LATIN_LETTER_RE.test(char) ||
      DIGIT_RE.test(char) ||
      COMMON_READABLE_SYMBOL_RE.test(char) ||
      /\s/.test(char);
    if (isOrdinary) continue;
    suspiciousTotal++;
    frequencies.set(char, (frequencies.get(char) ?? 0) + 1);
  }

  if (meaningfulText.length === 0 || suspiciousTotal === 0) return 0;
  const maxCount = Math.max(0, ...frequencies.values());
  return maxCount / meaningfulText.length;
}

/** Share of whitespace-separated tokens that look like a real word or number (letters/digits/common punctuation only). */
function readableTokenRatio(text: string): number {
  const tokens = text.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return 0;

  const readableTokenRe = /^[\p{L}\p{N}.,%\-/]+$/u;
  const readableTokens = tokens.filter((token) => readableTokenRe.test(token));
  return readableTokens.length / tokens.length;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Maps a value that is "bad below `poorAt`, fine at/above `goodAt`" onto a 0..1 sub-score (linear ramp between the two). */
function rampScore(value: number, poorAt: number, goodAt: number): number {
  if (goodAt === poorAt) return value >= goodAt ? 1 : 0;
  return clamp01((value - poorAt) / (goodAt - poorAt));
}

/** Maps a value that is "fine below `goodAt`, bad at/above `poorAt`" onto a 0..1 sub-score (inverse ramp). */
function inverseRampScore(value: number, goodAt: number, poorAt: number): number {
  if (poorAt === goodAt) return value <= goodAt ? 1 : 0;
  return clamp01(1 - (value - goodAt) / (poorAt - goodAt));
}

/**
 * Financial-integrity thresholds — separate from the general
 * `TEXT_QUALITY_THRESHOLDS` since they only ever apply when the text
 * actually contains tracked financial contract labels (see
 * `evaluateFinancialIntegrity`'s `applicable` flag).
 */
export const FINANCIAL_INTEGRITY_THRESHOLDS = {
  SCORE_GOOD: 75,
  SCORE_POOR: 40,
  COVERAGE_GAP_PENALTY_WEIGHT: 60,
  ZERO_SUSPICION_PENALTY: 8,
  BROKEN_PATTERN_PENALTY: 8,
  ARITHMETIC_CONFLICT_PENALTY: 10,
  DURATION_CONFLICT_PENALTY: 10,
} as const;

function scoreToQuality(score: number): DocumentTextQuality {
  if (score >= FINANCIAL_INTEGRITY_THRESHOLDS.SCORE_GOOD) return "good";
  if (score >= FINANCIAL_INTEGRITY_THRESHOLDS.SCORE_POOR) return "partial";
  return "poor";
}

/**
 * Scores whether the financial numbers in a contract's text are internally
 * trustworthy — a dimension `evaluateTextQuality`'s general readability
 * score cannot see at all (mojibake/density/symbol-ratio checks say
 * nothing about whether "المبلغ الممول" resolved to a real number or a
 * corrupted "0"). Only applies when at least one tracked financial label is
 * actually present in the text — a lease or employment contract with no
 * financing fields is never penalized for "missing" financing values.
 */
export function evaluateFinancialIntegrity(text: string): FinancialIntegrityResult {
  const recovery = recoverFinancialValues(text);
  const labelsFound = recovery.values.filter((value) => !value.warnings.some((w) => w.includes("no label found")));
  // "Had a nearby numeric value at all" excludes only the case where the
  // label was found but literally no digits/words followed it — a
  // suspicious "0" or a broken multi-fragment reading still counts as
  // "found a value", just not a trustworthy one (tracked separately below).
  const labelsWithNearbyValue = labelsFound.filter(
    (value) => !value.evidence.some((e) => e.includes("no numeric value nearby")),
  );

  if (labelsFound.length === 0) {
    return { applicable: false, quality: null, score: null, metrics: null, warnings: [] };
  }

  const resolvedCount = labelsFound.filter((value) => value.status === "direct" || value.status === "recovered").length;
  const zeroAmountSuspicionCount = labelsFound.filter((value) =>
    value.warnings.some((w) => w.includes("suspicious") || w.includes('read "0"')),
  ).length;
  const brokenAmountPatternCount = labelsFound.filter((value) => value.status === "ambiguous").length;
  const recoverableAmountWordCount = labelsFound.filter((value) => value.source === "amount_words").length;
  const arithmeticConflictCount = recovery.warnings.filter((w) => w.includes("does not match")).length;
  const durationConflictCount = recovery.warnings.filter((w) => w.includes("loanTermMonths") && w.includes("conflicts")).length;
  const percentageContextMismatchCount = labelsFound.filter(
    (value) => value.unit === "percent" && value.status === "direct" && value.source === "ocr_digits",
  ).length;

  const numberTokens = (text.match(/\d[\d,]*\d|\d/g) ?? []).map((token) => token.replace(/,/g, ""));
  const numberCounts = new Map<string, number>();
  for (const token of numberTokens) {
    numberCounts.set(token, (numberCounts.get(token) ?? 0) + 1);
  }
  const repeatedNumberCount = [...numberCounts.values()].filter((count) => count >= 2).length;
  const tableNumericDensity = numberCounts.size > 0 ? repeatedNumberCount / numberCounts.size : 0;

  const metrics: FinancialIntegrityMetrics = {
    financialLabelCount: labelsFound.length,
    financialLabelWithNearbyNumericValueCount: labelsWithNearbyValue.length,
    financialLabelCoverageRatio: resolvedCount / labelsFound.length,
    zeroAmountSuspicionCount,
    brokenAmountPatternCount,
    percentageContextMismatchCount,
    durationConflictCount,
    arithmeticConflictCount,
    recoverableAmountWordCount,
    tableNumericDensity,
  };

  const coverageGapPenalty = (1 - metrics.financialLabelCoverageRatio) * FINANCIAL_INTEGRITY_THRESHOLDS.COVERAGE_GAP_PENALTY_WEIGHT;
  const score = Math.round(
    Math.max(
      0,
      100 -
        coverageGapPenalty -
        zeroAmountSuspicionCount * FINANCIAL_INTEGRITY_THRESHOLDS.ZERO_SUSPICION_PENALTY -
        brokenAmountPatternCount * FINANCIAL_INTEGRITY_THRESHOLDS.BROKEN_PATTERN_PENALTY -
        arithmeticConflictCount * FINANCIAL_INTEGRITY_THRESHOLDS.ARITHMETIC_CONFLICT_PENALTY -
        durationConflictCount * FINANCIAL_INTEGRITY_THRESHOLDS.DURATION_CONFLICT_PENALTY,
    ),
  );

  return {
    applicable: true,
    quality: scoreToQuality(score),
    score,
    metrics,
    warnings: recovery.warnings.map((w) => `[FINANCIAL_INTEGRITY] ${w}`),
  };
}

/**
 * Decides whether an extracted PDF text is trustworthy enough to use as-is,
 * or whether OCR should be attempted instead. Deliberately does not depend
 * on any specific Arabic or English word — contracts vary too much for a
 * keyword check to be reliable — and instead scores structural signals:
 * character density per page, the mix of readable-script/digit/punctuation
 * characters versus everything else, mojibake byte-pattern markers,
 * Unicode replacement characters, abnormal single-symbol repetition, and
 * the share of whitespace-separated tokens that look like real words or
 * numbers. When the text contains financial contract labels, the result is
 * additionally capped by `evaluateFinancialIntegrity` — a text that reads
 * fine in general but whose financial numbers are corrupted must never
 * score as "good" overall (see the `financial` field, and `quality`/`score`,
 * which reflect the combined result).
 */
export function evaluateTextQuality(text: string, pageCount: number): TextQualityResult {
  const warnings: string[] = [];
  const effectivePageCount = Math.max(1, pageCount);
  const meaningfulText = text.replace(/\s/g, "");
  const totalCharacters = text.length;
  const charactersPerPage = totalCharacters / effectivePageCount;

  if (meaningfulText.length < TEXT_QUALITY_THRESHOLDS.MIN_MEANINGFUL_CHARACTERS) {
    return {
      quality: "poor",
      score: 0,
      shouldUseOcr: true,
      warnings: ["[TEXT_TOO_SHORT] the extracted text has almost no content"],
      metrics: {
        totalCharacters,
        charactersPerPage,
        readableCharacterRatio: 0,
        suspiciousSymbolRatio: 0,
        mojibakeRatio: 0,
        replacementCharacterCount: 0,
      },
      generalQuality: "poor",
      generalScore: 0,
      financial: { applicable: false, quality: null, score: null, metrics: null, warnings: [] },
    };
  }

  const counts = classifyCharacters(meaningfulText);
  const readableCount = counts.arabic + counts.latin + counts.digit + counts.commonSymbol;
  const readableCharacterRatio = readableCount / meaningfulText.length;
  const suspiciousSymbolRatio = counts.other / meaningfulText.length;
  const mojibakeRatio = counts.mojibakeMarkers / meaningfulText.length;
  const replacementCharacterRatio = counts.replacementChars / meaningfulText.length;
  const maxSymbolFrequencyRatio = maxSuspiciousSymbolFrequencyRatio(meaningfulText);
  const tokenReadableRatio = readableTokenRatio(text);

  if (mojibakeRatio >= TEXT_QUALITY_THRESHOLDS.MOJIBAKE_RATIO_PARTIAL) {
    warnings.push(
      `[MOJIBAKE_DETECTED] repeated encoding-mismatch markers (U+00D9/D8/C3/C2) found (${(mojibakeRatio * 100).toFixed(2)}% of characters)`,
    );
  }
  if (replacementCharacterRatio >= TEXT_QUALITY_THRESHOLDS.REPLACEMENT_CHAR_RATIO_PARTIAL) {
    warnings.push(`[REPLACEMENT_CHARACTERS] ${counts.replacementChars} Unicode replacement character(s) found`);
  }
  if (charactersPerPage < TEXT_QUALITY_THRESHOLDS.CHARS_PER_PAGE_POOR) {
    warnings.push(`[LOW_TEXT_DENSITY] only ${charactersPerPage.toFixed(1)} characters per page on average`);
  }
  if (suspiciousSymbolRatio >= TEXT_QUALITY_THRESHOLDS.SUSPICIOUS_RATIO_PARTIAL) {
    warnings.push(`[SUSPICIOUS_SYMBOLS] ${(suspiciousSymbolRatio * 100).toFixed(1)}% of characters are unrecognized symbols`);
  }
  if (maxSymbolFrequencyRatio >= TEXT_QUALITY_THRESHOLDS.MAX_SINGLE_SYMBOL_FREQUENCY_PARTIAL) {
    warnings.push("[ABNORMAL_REPETITION] a single symbol is repeated an unusually large number of times");
  }
  if (tokenReadableRatio < TEXT_QUALITY_THRESHOLDS.READABLE_TOKEN_RATIO_PARTIAL) {
    warnings.push(`[FEW_READABLE_WORDS] only ${(tokenReadableRatio * 100).toFixed(1)}% of tokens look like real words or numbers`);
  }

  const subScores = [
    rampScore(charactersPerPage, TEXT_QUALITY_THRESHOLDS.CHARS_PER_PAGE_POOR, TEXT_QUALITY_THRESHOLDS.CHARS_PER_PAGE_GOOD),
    rampScore(readableCharacterRatio, TEXT_QUALITY_THRESHOLDS.READABLE_RATIO_POOR, TEXT_QUALITY_THRESHOLDS.READABLE_RATIO_GOOD),
    inverseRampScore(suspiciousSymbolRatio, TEXT_QUALITY_THRESHOLDS.SUSPICIOUS_RATIO_PARTIAL, TEXT_QUALITY_THRESHOLDS.SUSPICIOUS_RATIO_POOR),
    inverseRampScore(mojibakeRatio, TEXT_QUALITY_THRESHOLDS.MOJIBAKE_RATIO_PARTIAL, TEXT_QUALITY_THRESHOLDS.MOJIBAKE_RATIO_POOR),
    inverseRampScore(replacementCharacterRatio, TEXT_QUALITY_THRESHOLDS.REPLACEMENT_CHAR_RATIO_PARTIAL, TEXT_QUALITY_THRESHOLDS.REPLACEMENT_CHAR_RATIO_POOR),
    inverseRampScore(maxSymbolFrequencyRatio, TEXT_QUALITY_THRESHOLDS.MAX_SINGLE_SYMBOL_FREQUENCY_PARTIAL, TEXT_QUALITY_THRESHOLDS.MAX_SINGLE_SYMBOL_FREQUENCY_POOR),
    rampScore(tokenReadableRatio, TEXT_QUALITY_THRESHOLDS.READABLE_TOKEN_RATIO_POOR, TEXT_QUALITY_THRESHOLDS.READABLE_TOKEN_RATIO_PARTIAL),
  ];
  const generalScore = Math.round((subScores.reduce((sum, value) => sum + value, 0) / subScores.length) * 100);

  let generalQuality: DocumentTextQuality;
  if (generalScore >= TEXT_QUALITY_THRESHOLDS.SCORE_GOOD) {
    generalQuality = "good";
  } else if (generalScore >= TEXT_QUALITY_THRESHOLDS.SCORE_POOR) {
    generalQuality = "partial";
  } else {
    generalQuality = "poor";
  }

  // A clear, individually-decisive distortion signal forces "poor" even if
  // the blended average score would otherwise land in "partial" — heavily
  // mojibake'd or replacement-character-laden text is never safe to use
  // as-is regardless of how the rest of the blend scores.
  if (
    mojibakeRatio >= TEXT_QUALITY_THRESHOLDS.MOJIBAKE_RATIO_POOR ||
    replacementCharacterRatio >= TEXT_QUALITY_THRESHOLDS.REPLACEMENT_CHAR_RATIO_POOR
  ) {
    generalQuality = "poor";
  }

  // Financial-integrity checks only ever apply when the text actually
  // contains a tracked financial label — a non-financial contract's overall
  // quality is never penalized by this dimension.
  const financial = evaluateFinancialIntegrity(text);
  const score = financial.applicable && financial.score !== null ? Math.min(generalScore, financial.score) : generalScore;

  let quality: DocumentTextQuality;
  if (score >= TEXT_QUALITY_THRESHOLDS.SCORE_GOOD) {
    quality = "good";
  } else if (score >= TEXT_QUALITY_THRESHOLDS.SCORE_POOR) {
    quality = "partial";
  } else {
    quality = "poor";
  }
  if (generalQuality === "poor") {
    quality = "poor";
  }

  const shouldUseOcr =
    quality === "poor" || (quality === "partial" && score < TEXT_QUALITY_THRESHOLDS.SCORE_PARTIAL_LEAN_OCR);

  return {
    quality,
    score,
    shouldUseOcr,
    warnings: [...warnings, ...financial.warnings],
    metrics: {
      totalCharacters,
      charactersPerPage,
      readableCharacterRatio,
      suspiciousSymbolRatio,
      mojibakeRatio,
      replacementCharacterCount: counts.replacementChars,
    },
    generalQuality,
    generalScore,
    financial,
  };
}
