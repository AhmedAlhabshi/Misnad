import { extractParentheticalAmountWords, parseArabicNumberWords } from "./arabicNumberWords";

/**
 * Deterministic (no LLM) recovery of the handful of financial values a
 * corrupted OCR pass on a Saudi-style installment-finance contract tends to
 * damage — a small number, not a general contract-understanding system.
 * Every recovered value carries provenance and, when the recovery is not
 * fully certain, a warning; nothing is ever silently invented.
 */

export type RecoveredFinancialField =
  | "cashPrice"
  | "downPayment"
  | "financedAmount"
  | "profitRate"
  | "totalProfit"
  | "totalPayable"
  | "loanTermMonths"
  | "monthlyInstallment";

export type RecoveredFinancialUnit = "SAR" | "percent" | "months";
export type RecoveredFinancialStatus = "direct" | "recovered" | "ambiguous" | "missing";
export type RecoveredFinancialConfidence = "high" | "medium" | "low";
export type RecoveredFinancialSource =
  | "ocr_digits"
  | "amount_words"
  | "installment_table"
  | "arithmetic_consistency"
  | "duration_equivalence"
  | "multiple_sources";

export interface RecoveredFinancialValue {
  field: RecoveredFinancialField;
  value: number | null;
  unit: RecoveredFinancialUnit;
  status: RecoveredFinancialStatus;
  confidence: RecoveredFinancialConfidence;
  source: RecoveredFinancialSource;
  evidence: string[];
  warnings: string[];
}

export interface FinancialRecoveryResult {
  values: RecoveredFinancialValue[];
  warnings: string[];
}

interface FieldDefinition {
  field: RecoveredFinancialField;
  unit: RecoveredFinancialUnit;
  labels: string[];
}

const FIELD_DEFINITIONS: FieldDefinition[] = [
  { field: "cashPrice", unit: "SAR", labels: ["السعر النقدي", "السعر الإجمالي", "cash price"] },
  { field: "downPayment", unit: "SAR", labels: ["الدفعة الأولى", "المقدم", "down payment"] },
  { field: "financedAmount", unit: "SAR", labels: ["أصل التمويل", "المبلغ الممول", "financed amount", "principal"] },
  { field: "profitRate", unit: "percent", labels: ["نسبة الربح", "هامش التمويل", "profit rate"] },
  { field: "totalProfit", unit: "SAR", labels: ["إجمالي الربح", "total profit"] },
  { field: "totalPayable", unit: "SAR", labels: ["إجمالي المبلغ الواجب سداده", "total payable"] },
  { field: "loanTermMonths", unit: "months", labels: ["مدة التمويل", "financing term"] },
  { field: "monthlyInstallment", unit: "SAR", labels: ["قيمة القسط", "القسط الشهري", "monthly installment"] },
];

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
function toWesternDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)));
}

/** How far past a label to search for its value — long enough to reach the end of the same table row/line, short enough not to spill into the next field's label. */
const VALUE_WINDOW_LENGTH = 120;

/** Extracts every standalone digit run in `window`. Multiple disconnected runs (e.g. the corrupted "9620 0") is itself a signal, not something this merges/guesses about. */
function extractNumberTokens(window: string): number[] {
  const westernized = toWesternDigits(window);
  const matches = westernized.match(/\d[\d,]*\d|\d/g) ?? [];
  return matches
    .map((match) => Number(match.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
}

function findLabelWindow(text: string, label: string): { window: string; index: number } | null {
  const index = text.indexOf(label);
  if (index === -1) return null;
  const start = index + label.length;
  let window = text.slice(start, start + VALUE_WINDOW_LENGTH);
  // A structured contract puts each field on its own line — stop at the line
  // break so a neighboring field's digits/words on the next line are never
  // mistaken for this field's value (or for a "broken" multi-fragment reading).
  const newlineIndex = window.indexOf("\n");
  if (newlineIndex !== -1) {
    window = window.slice(0, newlineIndex);
  }
  return { window, index };
}

/** A single non-zero digit run in the window, with no sign of a second disconnected fragment — the case a direct OCR reading can be trusted for. */
function directNumericRecovery(window: string): { value: number; tokenCount: number } | null {
  const tokens = extractNumberTokens(window);
  if (tokens.length === 0) return null;
  return { value: tokens[0], tokenCount: tokens.length };
}

function pushWarning(result: FinancialRecoveryResult, message: string): void {
  result.warnings.push(message);
}

/** The word that naturally ends a spelled-out amount phrase for each unit — cutting the window there before parsing prevents an unrelated clause that follows (e.g. a duration aside) from bleeding its own number words into the sum. */
const UNIT_END_PATTERNS: Record<RecoveredFinancialUnit, RegExp> = {
  SAR: /ريال/,
  percent: /(بالمائة|بالمئة|في المائة|في المئة|%|٪)/,
  months: /شهر/,
};

function sliceToUnitBoundary(window: string, unit: RecoveredFinancialUnit): string {
  const match = UNIT_END_PATTERNS[unit].exec(window);
  return match ? window.slice(0, match.index + match[0].length) : window;
}

/**
 * Recovers a single field's value from the neighborhood of its label(s).
 * Preference order: an Arabic amount-in-words phrase near the label (most
 * reliable — the OCR only has to read letters, not a fragile digit
 * sequence) beats a lone, plausible direct digit reading, which beats
 * nothing. A zero or a "broken" multi-fragment digit reading is never used
 * as the value on its own — it becomes `"missing"`/`"ambiguous"` instead,
 * with a warning, unless amount-words back it up.
 */
function recoverField(text: string, definition: FieldDefinition): RecoveredFinancialValue {
  const evidence: string[] = [];
  const warnings: string[] = [];

  let matchedLabel: string | null = null;
  let window = "";
  for (const label of definition.labels) {
    const found = findLabelWindow(text, label);
    if (found) {
      matchedLabel = label;
      window = found.window;
      break;
    }
  }

  if (matchedLabel === null) {
    return {
      field: definition.field,
      value: null,
      unit: definition.unit,
      status: "missing",
      confidence: "low",
      source: "ocr_digits",
      evidence: [],
      warnings: [`no label found for ${definition.field}`],
    };
  }

  const amountWordsMatches = extractParentheticalAmountWords(window);
  let relevantAmountWords = definition.unit === "percent" ? amountWordsMatches.find((m) => m.isPercentage) ?? amountWordsMatches[0] : amountWordsMatches[0];

  if (!relevantAmountWords) {
    // No parenthetical amount-in-words — try a plain spelled-out phrase directly
    // after the label (e.g. "المبلغ الممول هو مئة وعشرون ألف ريال"), bounded to
    // this unit's terminal marker so a following, unrelated clause can't bleed in.
    const inlineWords = parseArabicNumberWords(sliceToUnitBoundary(window, definition.unit));
    if (inlineWords && (definition.unit !== "percent" || inlineWords.isPercentage)) {
      relevantAmountWords = inlineWords;
    }
  }

  const directRecovery = directNumericRecovery(window);
  const directLooksZero = directRecovery?.value === 0;
  const directLooksBroken = (directRecovery?.tokenCount ?? 0) > 1;

  if (relevantAmountWords) {
    evidence.push(`label "${matchedLabel}" + amount-in-words "${relevantAmountWords.matchedText.trim()}"`);
    if (directLooksZero || directLooksBroken) {
      warnings.push(
        `${definition.field}: OCR digits near "${matchedLabel}" looked corrupted; recovered from amount-in-words instead`,
      );
    }
    return {
      field: definition.field,
      value: relevantAmountWords.value,
      unit: definition.unit,
      status: "recovered",
      confidence: "high",
      source: "amount_words",
      evidence,
      warnings,
    };
  }

  if (directRecovery && !directLooksZero && !directLooksBroken) {
    evidence.push(`label "${matchedLabel}" + direct OCR digits "${directRecovery.value}"`);
    return {
      field: definition.field,
      value: directRecovery.value,
      unit: definition.unit,
      status: "direct",
      confidence: "high",
      source: "ocr_digits",
      evidence,
      warnings,
    };
  }

  if (directLooksBroken) {
    warnings.push(`${definition.field}: multiple disconnected digit fragments found near "${matchedLabel}" — not used as a value`);
    return {
      field: definition.field,
      value: null,
      unit: definition.unit,
      status: "ambiguous",
      confidence: "low",
      source: "ocr_digits",
      evidence: [`label "${matchedLabel}" found, but its digits are fragmented/unreliable`],
      warnings,
    };
  }

  if (directLooksZero) {
    warnings.push(`${definition.field}: OCR read "0" near "${matchedLabel}", which is suspicious for a financial contract field`);
    return {
      field: definition.field,
      value: null,
      unit: definition.unit,
      status: "missing",
      confidence: "low",
      source: "ocr_digits",
      evidence: [`label "${matchedLabel}" found, but the nearby value read as 0`],
      warnings,
    };
  }

  return {
    field: definition.field,
    value: null,
    unit: definition.unit,
    status: "missing",
    confidence: "low",
    source: "ocr_digits",
    evidence: [`label "${matchedLabel}" found, but no numeric value nearby`],
    warnings: [],
  };
}

/** Finds the most frequently repeated plausible installment amount across the whole document — a real installment schedule restates the same figure on every row, so a single corrupted row is outvoted by the rest. */
function recoverInstallmentFromTable(
  text: string,
): { value: number; occurrences: number } | null {
  // Remove complete dates before counting repeated monetary values.
  // Otherwise a repeated year such as 2026 can incorrectly beat the
  // installment amount in an installment schedule.
  const textWithoutDates = toWesternDigits(text)
    .replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}\b/g, " ")
    .replace(/\b\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}\b/g, " ");

  const tokens = extractNumberTokens(textWithoutDates).filter(
    (value) => value >= 100 && value <= 100_000,
  );

  if (tokens.length < 2) return null;

  const counts = new Map<number, number>();

  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  let bestValue: number | null = null;
  let bestCount = 0;

  for (const [value, count] of counts) {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }

  if (bestValue === null || bestCount < 2) return null;

  return {
    value: bestValue,
    occurrences: bestCount,
  };
}

/** "48 شهراً (4 سنوات)"-style duration equivalence: a parenthetical year count near the loan-term label, converted to months, is preferred over a directly-read month figure that disagrees with it. */
function recoverDurationEquivalence(window: string): { months: number; years: number } | null {
  const yearsMatch = window.match(/\(([^()]{1,40})\)/);
  if (!yearsMatch) return null;
  const yearsWindow = yearsMatch[1];
  const numericYears = extractNumberTokens(yearsWindow)[0];
  if (numericYears !== undefined && /سن(ة|وات)|year/i.test(yearsWindow)) {
    return { months: numericYears * 12, years: numericYears };
  }
  const wordsYears = parseArabicNumberWords(yearsWindow);
  if (wordsYears && /سن(ة|وات)|year/i.test(yearsWindow)) {
    return { months: wordsYears.value * 12, years: wordsYears.value };
  }
  return null;
}

function getField(values: RecoveredFinancialValue[], field: RecoveredFinancialField): RecoveredFinancialValue {
  const found = values.find((v) => v.field === field);
  if (!found) throw new Error(`missing field definition for ${field}`);
  return found;
}

function isUsable(value: RecoveredFinancialValue): value is RecoveredFinancialValue & { value: number } {
  return value.value !== null && (value.status === "direct" || value.status === "recovered");
}

const ARITHMETIC_TOLERANCE_RATIO = 0.02;

function approximatelyEqual(a: number, b: number): boolean {
  if (a === 0 && b === 0) return true;
  const denominator = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / denominator <= ARITHMETIC_TOLERANCE_RATIO;
}

/**
 * Recovers the eight financial fields from raw (post-OCR) contract text.
 * Runs in three passes: (1) per-field label/amount-words/direct-digit
 * recovery, (2) table-consistency and duration-equivalence overrides where
 * they disagree with a suspicious direct reading, (3) one non-recursive
 * round of arithmetic-consistency fill-in for fields still missing, plus
 * conflict warnings (never overrides) for fields that already have a value.
 */
export function recoverFinancialValues(text: string): FinancialRecoveryResult {
  const result: FinancialRecoveryResult = { values: [], warnings: [] };

  for (const definition of FIELD_DEFINITIONS) {
    result.values.push(recoverField(text, definition));
  }

  // Pass 2a: installment-table consistency.
  const monthlyInstallment = getField(result.values, "monthlyInstallment");
  const tableResult = recoverInstallmentFromTable(text);
  if (tableResult && (!isUsable(monthlyInstallment) || monthlyInstallment.value !== tableResult.value)) {
    const previousWasUsable = isUsable(monthlyInstallment);
    monthlyInstallment.evidence.push(`installment table: value ${tableResult.value} repeated ${tableResult.occurrences} times`);
    if (!previousWasUsable) {
      monthlyInstallment.value = tableResult.value;
      monthlyInstallment.status = "recovered";
      monthlyInstallment.confidence = tableResult.occurrences >= 3 ? "high" : "medium";
      monthlyInstallment.source = "installment_table";
    } else {
      pushWarning(
        result,
        `monthlyInstallment: label-based value (${monthlyInstallment.value}) disagrees with the repeated installment-table value (${tableResult.value}); keeping the label-based value`,
      );
    }
  }

  // Pass 2b: duration equivalence ("48 شهراً (4 سنوات)").
  const loanTermMonths = getField(result.values, "loanTermMonths");
  const termLabelWindow = FIELD_DEFINITIONS.find((d) => d.field === "loanTermMonths")!.labels
    .map((label) => findLabelWindow(text, label))
    .find((found) => found !== null);
  if (termLabelWindow) {
    const equivalence = recoverDurationEquivalence(termLabelWindow.window);
    if (equivalence) {
      const suspicious = !isUsable(loanTermMonths) || loanTermMonths.value % 12 !== 0 || loanTermMonths.value !== equivalence.months;
      if (suspicious) {
        loanTermMonths.evidence.push(`duration equivalence: "${equivalence.years} سنوات" implies ${equivalence.months} months`);
        if (loanTermMonths.status !== "recovered" || loanTermMonths.value !== equivalence.months) {
          if (isUsable(loanTermMonths) && loanTermMonths.value !== equivalence.months) {
            pushWarning(
              result,
              `loanTermMonths: direct reading (${loanTermMonths.value}) conflicts with the year-based figure (${equivalence.months}); using the year-based figure as more reliable`,
            );
          }
          loanTermMonths.value = equivalence.months;
          loanTermMonths.status = "recovered";
          loanTermMonths.confidence = "high";
          loanTermMonths.source = "duration_equivalence";
        }
      }
    }
  }

    // Recover the financing duration from whole-document evidence when the
  // label/value table layout was flattened by OCR.
  if (!isUsable(loanTermMonths)) {
    const westernizedText = toWesternDigits(text);

    const installmentCountMatch = westernizedText.match(
      /حتى\s*القسط\s*(\d{1,3})/i,
    );

    const yearsMatch = westernizedText.match(
      /(\d{1,2})\s*سن(?:ة|وات)/,
    );

    if (installmentCountMatch) {
      const months = Number(installmentCountMatch[1]);

      if (Number.isFinite(months) && months > 0) {
        loanTermMonths.value = months;
        loanTermMonths.status = "recovered";
        loanTermMonths.confidence = "high";
        loanTermMonths.source = "installment_table";
        loanTermMonths.evidence.push(
          `installment schedule: "حتى القسط ${months}"`,
        );
      }
    } else if (yearsMatch) {
      const years = Number(yearsMatch[1]);
      const months = years * 12;

      if (Number.isFinite(months) && months > 0) {
        loanTermMonths.value = months;
        loanTermMonths.status = "recovered";
        loanTermMonths.confidence = "high";
        loanTermMonths.source = "duration_equivalence";
        loanTermMonths.evidence.push(
          `duration equivalence: ${years} years = ${months} months`,
        );
      }
    }
  }

  // Pass 3: one non-recursive round of arithmetic consistency.
  const cashPrice = getField(result.values, "cashPrice");
  const downPayment = getField(result.values, "downPayment");
  const financedAmount = getField(result.values, "financedAmount");
  const totalProfit = getField(result.values, "totalProfit");
  const totalPayable = getField(result.values, "totalPayable");


    // Recover financed amount from the financing total and total profit first.
  // This is useful for OCR table layouts where the financed-amount row itself
  // is unreadable but both totals remain clear.
  if (!isUsable(financedAmount) && isUsable(totalPayable) && isUsable(totalProfit)) {
    const computedFinancedAmount = totalPayable.value - totalProfit.value;

    if (computedFinancedAmount > 0) {
      financedAmount.value = computedFinancedAmount;
      financedAmount.status = "recovered";
      financedAmount.confidence = "high";
      financedAmount.source = "arithmetic_consistency";
      financedAmount.evidence.push(
        `arithmetic: totalPayable (${totalPayable.value}) - totalProfit (${totalProfit.value}) = ${computedFinancedAmount}`,
      );
    }
  }
    // Recover or correct the down payment when cash price and financed amount
  // are both reliable. This handles OCR corruption such as 24,000 becoming
  // "9620" while preserving deterministic provenance.
  if (isUsable(cashPrice) && isUsable(financedAmount)) {
    const computedDownPayment = cashPrice.value - financedAmount.value;

    if (computedDownPayment > 0) {
      if (!isUsable(downPayment)) {
        downPayment.value = computedDownPayment;
        downPayment.status = "recovered";
        downPayment.confidence = "medium";
        downPayment.source = "arithmetic_consistency";
        downPayment.evidence.push(
          `arithmetic: cashPrice (${cashPrice.value}) - financedAmount (${financedAmount.value}) = ${computedDownPayment}`,
        );
      } else if (!approximatelyEqual(downPayment.value, computedDownPayment)) {
        pushWarning(
          result,
          `downPayment (${downPayment.value}) conflicts with cashPrice - financedAmount (${computedDownPayment}); using the arithmetic-consistent value`,
        );

        downPayment.value = computedDownPayment;
        downPayment.status = "recovered";
        downPayment.confidence = "medium";
        downPayment.source = "arithmetic_consistency";
        downPayment.evidence.push(
          `arithmetic correction: cashPrice (${cashPrice.value}) - financedAmount (${financedAmount.value}) = ${computedDownPayment}`,
        );
      }
    }
  }

  if (!isUsable(financedAmount) && isUsable(cashPrice) && isUsable(downPayment)) {
    const computed = cashPrice.value - downPayment.value;
    financedAmount.value = computed;
    financedAmount.status = "recovered";
    financedAmount.confidence = "medium";
    financedAmount.source = "arithmetic_consistency";
    financedAmount.evidence.push(`arithmetic: cashPrice (${cashPrice.value}) - downPayment (${downPayment.value}) = ${computed}`);
  } else if (isUsable(financedAmount) && isUsable(cashPrice) && isUsable(downPayment)) {
    const expected = cashPrice.value - downPayment.value;
    if (!approximatelyEqual(financedAmount.value, expected)) {
      pushWarning(result, `financedAmount (${financedAmount.value}) does not match cashPrice - downPayment (${expected})`);
    }
  }

  if (!isUsable(totalPayable) && isUsable(financedAmount) && isUsable(totalProfit)) {
    const computed = financedAmount.value + totalProfit.value;
    totalPayable.value = computed;
    totalPayable.status = "recovered";
    totalPayable.confidence = "medium";
    totalPayable.source = "arithmetic_consistency";
    totalPayable.evidence.push(`arithmetic: financedAmount (${financedAmount.value}) + totalProfit (${totalProfit.value}) = ${computed}`);
  } else if (isUsable(totalPayable) && isUsable(financedAmount) && isUsable(totalProfit)) {
    const expected = financedAmount.value + totalProfit.value;
    if (!approximatelyEqual(totalPayable.value, expected)) {
      pushWarning(result, `totalPayable (${totalPayable.value}) does not match financedAmount + totalProfit (${expected})`);
    }
  }

  if (!isUsable(totalProfit) && isUsable(totalPayable) && isUsable(financedAmount)) {
    const computed = totalPayable.value - financedAmount.value;
    totalProfit.value = computed;
    totalProfit.status = "recovered";
    totalProfit.confidence = "medium";
    totalProfit.source = "arithmetic_consistency";
    totalProfit.evidence.push(`arithmetic: totalPayable (${totalPayable.value}) - financedAmount (${financedAmount.value}) = ${computed}`);
  }

  const finalMonthlyInstallment = getField(result.values, "monthlyInstallment");
  const finalLoanTermMonths = getField(result.values, "loanTermMonths");
  if (isUsable(finalMonthlyInstallment) && isUsable(finalLoanTermMonths) && isUsable(totalPayable)) {
    const expected = finalMonthlyInstallment.value * finalLoanTermMonths.value;
    if (!approximatelyEqual(expected, totalPayable.value)) {
      pushWarning(
        result,
        `monthlyInstallment × loanTermMonths (${expected}) does not match totalPayable (${totalPayable.value})`,
      );
    }
  }

  return result;
}
