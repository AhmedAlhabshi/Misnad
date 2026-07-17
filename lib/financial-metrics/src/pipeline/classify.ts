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
 * Returns `true`/`false` when the text explicitly signals it. Otherwise —
 * the ambiguous middle case, e.g. a plainly-worded "Administrative fee:
 * 1,200 SAR" with no "mandatory"/"is paid"/"optional" verb at all — defaults
 * to `true` rather than `null`, as long as no conditional/optional/event
 * trigger keyword is present. This matters: a candidate extracted from the
 * contract as a real, named fee or obligation line item overwhelmingly is a
 * real, guaranteed cost; treating "no explicit verb" as "silently exclude
 * from every cost total" (the previous behavior) was a bug, not a safe
 * default — it caused legitimately mandatory fees to vanish from
 * `calculatedKnownCost`/`exposure`/ratios engine-wide. Text that already
 * reads as conditional/optional (`CONDITIONAL_KEYWORDS`/`OPTIONAL_KEYWORDS`)
 * still resolves to `false`/`null` here, and is separately marked
 * `conditional: true` by `inferConditionalFromText` — the `isGuaranteed`
 * eligibility gate excludes those regardless of what `mandatory` resolves
 * to, so this default change never reclassifies a genuinely conditional,
 * optional, or refundable item as a guaranteed cost.
 */
export function inferMandatoryFromText(...texts: Array<string | null | undefined>): boolean | null {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  if (containsAnyKeyword(combined, MANDATORY_KEYWORDS)) {
    return true;
  }
  if (containsAnyKeyword(combined, OPTIONAL_KEYWORDS)) {
    return false;
  }
  if (containsAnyKeyword(combined, CONDITIONAL_KEYWORDS)) {
    return null;
  }
  return true;
}

const CONDITIONAL_KEYWORDS = [
  "if", "in case", "should", "unless", "penalty", "late", "default", "cancellation",
  "early termination", "termination fee", "may apply", "in the event of",
  // Generic applicability/conditionality phrasing — not tied to any one
  // contract type or trigger event. A fact worded this way (e.g. "actual
  // collection costs, up to SAR 500, when applicable") is describing a
  // potential/variable cost, not a fixed guaranteed one, even without an
  // explicit "if"/"penalty" style trigger word.
  "when applicable", "as applicable", "if applicable", "where applicable",
  "as needed", "when necessary", "subject to", "contingent on", "contingent upon", "depending on",
  // Cap/maximum/minimum/range phrasing on its own also signals a variable,
  // non-fixed amount — a stated ceiling is not a guaranteed exact payment.
  "capped at", "up to a maximum", "not to exceed", "no more than", "up to",
  "إذا", "في حال", "غرامة", "تأخير", "إنهاء مبكر", "إنهاء العقد",
  "عند الاقتضاء", "حسب الحالة", "عند الحاجة", "حسب الحاجة", "بحسب الحاجة",
  "بحد أقصى", "لا يتجاوز", "حتى",
];

/** Returns `true` only when the text explicitly signals a future/triggered condition; `null` when unstated. */
export function inferConditionalFromText(...texts: Array<string | null | undefined>): boolean | null {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  return containsAnyKeyword(combined, CONDITIONAL_KEYWORDS) ? true : null;
}

export type PaymentTiming = "due_now" | "due_later";

/**
 * Explicit signal that a one-time amount is due immediately/at contract
 * start (down payments, signing/admin fees, brokerage fees, initial
 * premiums, activation/setup fees, ...) rather than at some later point
 * (a renewal fee, a final/balloon payment, a fee due upon a future event).
 * Checked ahead of `DUE_NOW_KEYWORDS` so a phrase that names a future event
 * (e.g. "final payment due at the end of the term") is never misread as
 * due-now just because it also mentions "due". When neither list matches,
 * timing is genuinely unstated — callers must never assume "due now" for
 * unstated timing, only for an explicit signal.
 */
const DUE_LATER_KEYWORDS = [
  "at the end of the term", "at the end of the contract", "at the end of the lease",
  "upon renewal", "at renewal", "after the first year", "at maturity", "upon expiry",
  "at contract end", "final payment", "balloon payment", "residual value",
  "عند انتهاء العقد", "عند نهاية العقد", "عند التجديد", "بعد السنة الأولى",
  "في نهاية المدة", "الدفعة الختامية", "الدفعة الأخيرة", "القيمة المتبقية",
];

const DUE_NOW_KEYWORDS = [
  "at signing", "upon signing", "at the signing", "at contract signing",
  "at contract start", "at the start of the contract", "due at signing",
  "payable at signing", "due now", "immediately due", "due immediately",
  "at closing", "at inception", "upon execution", "at activation", "upon activation",
  "at policy start", "upon policy issuance", "at the outset",
  "عند التوقيع", "عند توقيع العقد", "عند بدء العقد", "عند إبرام العقد",
  "فور التوقيع", "عند التفعيل", "عند بداية العقد", "عند إصدار الوثيقة", "عند بدء التغطية",
];

/**
 * Distinguishes a one-time amount confirmed due now (at signing/contract
 * start) from one confirmed due later, using only explicit timing wording —
 * never inferred from fee type, obligation type, or amount. Returns `null`
 * when the text states neither, which callers must treat as "timing
 * unknown" (excluded from any "due now" total), not as a default "due now".
 */
export function inferPaymentTimingFromText(...texts: Array<string | null | undefined>): PaymentTiming | null {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  if (containsAnyKeyword(combined, DUE_LATER_KEYWORDS)) {
    return "due_later";
  }
  if (containsAnyKeyword(combined, DUE_NOW_KEYWORDS)) {
    return "due_now";
  }
  return null;
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
  "total of payments", "total payments", "total installments", "total instalments",
  "إجمالي التكلفة", "المبلغ الإجمالي", "إجمالي المبلغ", "إجمالي الدفعات", "إجمالي الأقساط",
];

export function isStatedTotalCostText(...texts: Array<string | null | undefined>): boolean {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  return containsAnyKeyword(combined, TOTAL_COST_KEYWORDS);
}

const DUE_AT_SIGNING_TOTAL_KEYWORDS = [
  "due at signing", "total due at signing", "amount due at signing", "payable at signing",
  "total payable at signing", "cash due at signing", "due at lease signing", "total amount due at signing",
  "due at contract signing", "total due at contract signing",
  "المبلغ المستحق عند التوقيع", "الإجمالي المستحق عند التوقيع", "إجمالي المستحق عند التوقيع",
  "المبلغ الإجمالي المستحق عند التوقيع", "المستحق عند توقيع العقد", "إجمالي المبلغ المستحق عند التوقيع",
];

/**
 * True when the text names an amount as the total *due at signing/contract
 * start* — narrower than `isStatedTotalCostText` above (a stated grand total
 * for the whole contract), and used only to prefer a contract's own stated
 * upfront-cash figure over a per-item reconstruction when the two agree (see
 * `financialConcepts.ts`'s `selectApplicableUpfrontLiquidity` in the misnad
 * frontend).
 */
export function isStatedDueAtSigningText(...texts: Array<string | null | undefined>): boolean {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  return containsAnyKeyword(combined, DUE_AT_SIGNING_TOTAL_KEYWORDS);
}

const COMPENSATION_COMPONENT_KEYWORDS = [
  "housing allowance", "accommodation allowance", "transportation allowance", "transport allowance",
  "cost of living allowance", "fixed allowance", "guaranteed allowance", "monthly allowance",
  "بدل سكن", "بدل السكن", "بدل نقل", "بدل النقل", "بدل مواصلات", "بدل ثابت", "بدل شهري",
];

/** True when a candidate's own label/description reads as a guaranteed, fixed salary component (a housing/transportation/other fixed allowance) — never a conditional or variable amount. */
export function isCompensationComponentText(...texts: Array<string | null | undefined>): boolean {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  return containsAnyKeyword(combined, COMPENSATION_COMPONENT_KEYWORDS);
}

const STATED_TOTAL_COMPENSATION_KEYWORDS = [
  "total fixed monthly compensation", "total fixed compensation", "total monthly compensation",
  "total guaranteed compensation", "gross fixed monthly salary", "total fixed salary",
  "إجمالي الراتب الثابت الشهري", "إجمالي التعويض الثابت", "إجمالي الأجر الثابت الشهري", "إجمالي الراتب الشهري الثابت",
];

/** True when the text states one explicit total that already sums the guaranteed salary components (base + fixed allowances) — narrower than a generic stated grand total. */
export function isStatedTotalCompensationText(...texts: Array<string | null | undefined>): boolean {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  return containsAnyKeyword(combined, STATED_TOTAL_COMPENSATION_KEYWORDS);
}

const CONDITIONAL_COMPENSATION_KEYWORDS = [
  "performance bonus", "discretionary bonus", "annual bonus", "incentive bonus", "commission",
  "overtime pay", "overtime compensation", "variable pay", "profit share", "profit-sharing",
  "مكافأة الأداء", "مكافأة تقديرية", "مكافأة سنوية", "عمولة", "أجر إضافي", "بدل ساعات إضافية", "مكافأة تحفيزية",
];

/** True when the text describes non-guaranteed, performance-dependent compensation (a bonus, commission, or uncertain overtime pay) — never counted as guaranteed income. */
export function isConditionalCompensationText(...texts: Array<string | null | undefined>): boolean {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  return containsAnyKeyword(combined, CONDITIONAL_COMPENSATION_KEYWORDS);
}

const NON_CASH_BENEFIT_KEYWORDS = [
  "medical insurance", "health insurance", "annual leave", "paid leave", "overtime entitlement",
  "non-cash benefit", "in-kind benefit", "end of service", "end-of-service", "gratuity",
  "تأمين طبي", "تأمين صحي", "إجازة سنوية", "إجازة مدفوعة", "استحقاق العمل الإضافي", "مزايا عينية", "مكافأة نهاية الخدمة",
];

/** True when the text describes a non-cash or qualitative employment benefit (medical insurance, paid leave, overtime entitlement, ...) — never a monthly cost or guaranteed cash amount. */
export function isNonCashBenefitText(...texts: Array<string | null | undefined>): boolean {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  return containsAnyKeyword(combined, NON_CASH_BENEFIT_KEYWORDS);
}

const EMPLOYEE_ENTITLEMENT_KEYWORDS = [
  "entitled to compensation", "employee shall be entitled", "payable to the employee", "compensation to the employee",
  "compensation payable to the employee", "without a legitimate reason", "without legitimate reason",
  "without just cause", "without a just cause", "unjustified termination", "unjustified dismissal", "arbitrary dismissal",
  "يستحق الموظف", "تعويض للموظف", "يحق للموظف", "دون سبب مشروع", "دون مبرر مشروع", "بدون سبب مشروع", "فصل تعسفي", "إنهاء تعسفي",
];

/**
 * True when a conditional amount flows TO the employee (an employer-paid
 * termination/compensation entitlement) rather than the far more common
 * direction (the customer/employee owes the counterparty) every other
 * contract type's penalties assume. Checked only within the
 * employment-specific classification pass — never applied generically —
 * so a lease/auto-finance early-termination FEE (paid BY the customer) is
 * never affected.
 */
export function isEmployeeEntitlementText(...texts: Array<string | null | undefined>): boolean {
  const combined = texts.filter((text): text is string => typeof text === "string").join(" ");
  return containsAnyKeyword(combined, EMPLOYEE_ENTITLEMENT_KEYWORDS);
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
  // Generic reference/collateral-value phrasing — applies to a vehicle, a
  // property, equipment, or any other asset a contract describes a value
  // for, across every contract type, not just auto-finance.
  "vehicle value", "asset value", "vehicle price", "purchase price", "asset price",
  "cash price", "list price", "sale price", "contract price", "sticker price", "market value",
  "property value", "cash value", "insured value", "sum insured", "stated value", "declared value",
  "قيمة المركبة", "سعر المركبة", "قيمة العقار", "سعر الشراء", "قيمة الأصل",
  "السعر النقدي", "سعر البيع", "القيمة السوقية", "القيمة النقدية", "المبلغ المؤمن عليه",
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
