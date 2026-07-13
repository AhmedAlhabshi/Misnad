import type { FeeType, ObligationType, PaymentFrequency, PenaltyType } from "../enums";
import { containsAnyKeyword } from "../normalize/text";
import type { CandidateContext } from "./semantics";

/**
 * Bilingual (English/Arabic) keyword heuristics used to classify the free
 * text `description`/`condition` fields Milestone 4 provides into the
 * closed enums Milestone 5.5 defines. These are deterministic keyword
 * matches, not AI calls — when nothing matches, the item is classified
 * `"unknown"`/`"other"` rather than guessed.
 */

const OBLIGATION_TYPE_KEYWORDS: ReadonlyArray<{ type: ObligationType; keywords: readonly string[] }> = [
  {
    type: "principal",
    keywords: [
      "principal", "financed amount", "loan amount", "amount financed", "opening financed balance", "opening balance",
      "أصل المبلغ", "المبلغ الممول", "مبلغ التمويل", "الرصيد الممول الافتتاحي", "الرصيد الافتتاحي",
    ],
  },
  { type: "balloon_payment", keywords: ["balloon", "final payment", "residual value", "دفعة ختامية", "القيمة المتبقية"] },
  { type: "deposit", keywords: ["deposit", "security deposit", "تأمين", "وديعة", "عربون"] },
  { type: "upfront_payment", keywords: ["down payment", "downpayment", "upfront", "initial payment", "دفعة أولى", "دفعة مقدمة"] },
  { type: "insurance", keywords: ["insurance", "premium", "تأمين", "قسط التأمين"] },
  { type: "tax", keywords: ["tax", "vat", "ضريبة"] },
  { type: "conditional_payment", keywords: ["penalty", "late fee", "if applicable", "conditional", "غرامة", "شرط"] },
];

const RECURRING_FREQUENCIES = new Set<PaymentFrequency>(["daily", "weekly", "monthly", "quarterly", "semi_annual", "annual"]);

/**
 * Keyword match first; when nothing matches, an explicit resolved frequency
 * is used as a structural (not textual) fallback signal — a recurring
 * cadence implies `"recurring_payment"`, an exactly one-time cadence implies
 * `"one_time_payment"` — before finally giving up as `"unknown"`.
 */
export function classifyObligationTypeText(
  frequency: PaymentFrequency | null,
  ...texts: Array<string | null | undefined>
): ObligationType {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  for (const { type, keywords } of OBLIGATION_TYPE_KEYWORDS) {
    if (containsAnyKeyword(combined, keywords)) {
      return type;
    }
  }
  if (frequency !== null && RECURRING_FREQUENCIES.has(frequency)) {
    return "recurring_payment";
  }
  if (frequency === "one_time") {
    return "one_time_payment";
  }
  return "unknown";
}

const FEE_TYPE_KEYWORDS: ReadonlyArray<{ type: FeeType; keywords: readonly string[] }> = [
  { type: "administration", keywords: ["administration", "admin fee", "رسوم إدارية"] },
  { type: "processing", keywords: ["processing", "handling", "رسوم معالجة"] },
  { type: "subscription", keywords: ["subscription", "membership", "اشتراك"] },
  { type: "insurance", keywords: ["insurance", "premium", "تأمين"] },
  { type: "maintenance", keywords: ["maintenance", "صيانة"] },
  { type: "transfer", keywords: ["transfer", "تحويل"] },
  { type: "registration", keywords: ["registration", "تسجيل"] },
  { type: "service", keywords: ["service fee", "خدمة"] },
  { type: "renewal", keywords: ["renewal", "تجديد"] },
  { type: "tax", keywords: ["tax", "vat", "ضريبة"] },
];

export function classifyFeeTypeText(...texts: Array<string | null | undefined>): FeeType {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  for (const { type, keywords } of FEE_TYPE_KEYWORDS) {
    if (containsAnyKeyword(combined, keywords)) {
      return type;
    }
  }
  return "other";
}

const PENALTY_TYPE_KEYWORDS: ReadonlyArray<{ type: PenaltyType; keywords: readonly string[] }> = [
  { type: "late_payment", keywords: ["late payment", "late fee", "overdue", "تأخير السداد", "دفع متأخر"] },
  { type: "early_termination", keywords: ["early termination", "termination fee", "إنهاء مبكر"] },
  { type: "early_settlement", keywords: ["early settlement", "early repayment", "سداد مبكر"] },
  { type: "default", keywords: ["default", "breach", "إخلال"] },
  { type: "cancellation", keywords: ["cancellation", "إلغاء"] },
  { type: "returned_payment", keywords: ["returned payment", "bounced", "نسخ مرتجع", "شيك مرتجع"] },
];

export function classifyPenaltyTypeText(...texts: Array<string | null | undefined>): PenaltyType {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  for (const { type, keywords } of PENALTY_TYPE_KEYWORDS) {
    if (containsAnyKeyword(combined, keywords)) {
      return type;
    }
  }
  return "other";
}

const MANDATORY_KEYWORDS = ["mandatory", "required", "must pay", "إلزامي", "واجب"];
const OPTIONAL_KEYWORDS = ["optional", "voluntary", "if elected", "اختياري"];

/**
 * A plain declarative statement that a fee/amount *is* paid (no "if you
 * choose", no optional/conditional trigger) — e.g. "an administrative fee
 * of 1,000 SAR is paid after contract execution" — never says "mandatory"
 * literally, but leaves no room for the customer to avoid it. Only used as
 * a fallback signal, and only when no conditional trigger wording is also
 * present (see `inferMandatoryFromText`).
 */
const EXPLICIT_PAYMENT_KEYWORDS = [
  "is paid", "shall be paid", "will be paid", "paid after", "must be paid", "is payable", "is charged",
  "يُدفع", "تُدفع", "يتم دفعه", "تُسدد", "تدفع", "يستوفى", "تُستوفى",
];

/** Returns `true`/`false` only when the text explicitly signals it; `null` when genuinely unstated. */
export function inferMandatoryFromText(...texts: Array<string | null | undefined>): boolean | null {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  if (containsAnyKeyword(combined, MANDATORY_KEYWORDS)) {
    return true;
  }
  if (containsAnyKeyword(combined, OPTIONAL_KEYWORDS)) {
    return false;
  }
  if (containsAnyKeyword(combined, EXPLICIT_PAYMENT_KEYWORDS) && !containsAnyKeyword(combined, CONDITIONAL_KEYWORDS)) {
    return true;
  }
  return null;
}

const CONDITIONAL_KEYWORDS = [
  "if", "in case", "should", "upon", "unless", "penalty", "late", "default", "cancellation",
  "إذا", "في حال", "عند", "غرامة", "تأخير",
];

/** Returns `true` only when the text explicitly signals a future/triggered condition; `null` when unstated. */
export function inferConditionalFromText(...texts: Array<string | null | undefined>): boolean | null {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  return containsAnyKeyword(combined, CONDITIONAL_KEYWORDS) ? true : null;
}

const REFUNDABLE_KEYWORDS = ["refundable", "returned at the end", "قابل للاسترداد", "يسترد"];
const NON_REFUNDABLE_KEYWORDS = ["non-refundable", "nonrefundable", "not refundable", "غير قابل للاسترداد"];

/** Returns `true`/`false` only when the text explicitly signals it; `null` when genuinely unstated. */
export function inferRefundableFromText(...texts: Array<string | null | undefined>): boolean | null {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  if (containsAnyKeyword(combined, NON_REFUNDABLE_KEYWORDS)) {
    return false;
  }
  if (containsAnyKeyword(combined, REFUNDABLE_KEYWORDS)) {
    return true;
  }
  return null;
}

const TOTAL_COST_KEYWORDS = [
  "total cost", "total amount", "total repayment", "total payable", "grand total",
  "إجمالي التكلفة", "المبلغ الإجمالي", "إجمالي المبلغ",
];

export function isStatedTotalCostText(...texts: Array<string | null | undefined>): boolean {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  return containsAnyKeyword(combined, TOTAL_COST_KEYWORDS);
}

const DEPOSIT_KEYWORDS = ["deposit", "security deposit", "تأمين", "وديعة", "عربون"];

/** True when the text identifies the item as a deposit — the one item shape whose refundability is a genuinely open question (unlike an ordinary fee, which is conventionally non-refundable). */
export function isDepositLikeText(...texts: Array<string | null | undefined>): boolean {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  return containsAnyKeyword(combined, DEPOSIT_KEYWORDS);
}

const DURATION_UNIT_KEYWORDS = ["day", "days", "month", "months", "year", "years", "يوم", "أيام", "شهر", "أشهر", "سنة", "سنوات"];

/** True when a free-text unit label (e.g. an `extractedNumbers[].unit`) looks duration-related rather than monetary. */
export function looksLikeDurationUnitText(unit: string | null | undefined): boolean {
  if (typeof unit !== "string") {
    return false;
  }
  return containsAnyKeyword(unit, DURATION_UNIT_KEYWORDS);
}

const ASSET_VALUE_KEYWORDS = [
  "vehicle value", "asset value", "vehicle price", "purchase price", "asset price",
  "قيمة المركبة", "سعر المركبة", "قيمة العقار", "سعر الشراء", "قيمة الأصل",
];

/** True when the text describes a reference/collateral value (e.g. a vehicle's or property's value) — never itself a payment the customer owes. */
export function isAssetValueText(...texts: Array<string | null | undefined>): boolean {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  return containsAnyKeyword(combined, ASSET_VALUE_KEYWORDS);
}

const EARLY_SETTLEMENT_BALANCE_KEYWORDS = [
  "remaining balance", "outstanding balance", "remaining payments", "الرصيد المتبقي", "عدد الدفعات المتبقية",
];
const EARLY_SETTLEMENT_PAYMENT_KEYWORDS = [
  "early settlement", "early repayment", "early-settlement total", "settlement amount", "settlement total",
  "term cost", "three-month", "السداد المبكر", "التسوية المبكرة", "إجمالي التسوية المبكرة", "كلفة الأجل",
];
const DEFAULT_SCENARIO_KEYWORDS = ["upon default", "in the event of default", "عند التعثر", "في حال الإخلال"];
const CANCELLATION_SCENARIO_KEYWORDS = ["upon cancellation", "if cancelled", "عند الإلغاء", "في حال الإلغاء"];
const INSURANCE_CLAIM_KEYWORDS = ["insurance claim", "in the event of a claim", "مطالبة تأمين", "عند المطالبة"];

/**
 * Detects that a candidate belongs to a non-normal-path scenario (early
 * settlement, default, cancellation, an insurance claim) purely from its
 * own label/description/condition text — Milestone 4 has no structural
 * grouping to signal this, so text is the only available signal. Returns
 * `null` (normal contract path) when nothing matches.
 */
export function classifyScenarioContext(...texts: Array<string | null | undefined>): CandidateContext | null {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  if (
    containsAnyKeyword(combined, EARLY_SETTLEMENT_BALANCE_KEYWORDS) ||
    containsAnyKeyword(combined, EARLY_SETTLEMENT_PAYMENT_KEYWORDS)
  ) {
    return "early_settlement_scenario";
  }
  if (containsAnyKeyword(combined, DEFAULT_SCENARIO_KEYWORDS)) {
    return "default_scenario";
  }
  if (containsAnyKeyword(combined, CANCELLATION_SCENARIO_KEYWORDS)) {
    return "cancellation_scenario";
  }
  if (containsAnyKeyword(combined, INSURANCE_CLAIM_KEYWORDS)) {
    return "insurance_claim_scenario";
  }
  return null;
}

/** Within an early-settlement scenario, distinguishes a *balance* (what's still owed) from a *payment/cost* (an amount due as part of settling). */
export function isScenarioBalanceText(...texts: Array<string | null | undefined>): boolean {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  return containsAnyKeyword(combined, EARLY_SETTLEMENT_BALANCE_KEYWORDS);
}
