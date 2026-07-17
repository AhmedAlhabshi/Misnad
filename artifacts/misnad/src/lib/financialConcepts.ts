import type { ContractType } from "@workspace/contract-types";
import type {
  FeeItem,
  FeeType,
  FinancialMetrics,
  FinancialRole,
  InformationalAmount,
  InformationalAmountType,
  MoneyMetric,
  ObligationType,
  PaymentFrequency,
  PaymentObligation,
  PenaltyItem,
  PenaltyType,
  PercentageMetric,
} from "@workspace/financial-metrics";

/**
 * Canonical, cross-contract-type financial concept identifiers. Every
 * financial item — regardless of which backend array it came from — is
 * resolved to exactly one of these before being deduplicated or displayed.
 * This is the generic fix for the "administrative fee shown twice" bug:
 * two representations of the same real concept (one from
 * `paymentObligations`, one from `fees.items`) resolve to the SAME concept
 * id here even when their raw `frequency`/label strings differ, so they
 * merge correctly regardless of that mismatch.
 *
 * The list mirrors the concepts named in the product spec; a handful of
 * extension ids (`processing_fee`, `transfer_fee`, `registration_fee`,
 * `service_fee`, `early_settlement_fee`, `cancellation_fee`,
 * `returned_payment_fee`, `tax`, plus the generic
 * `recurring_payment`/`one_time_payment`/`conditional_payment` fallbacks)
 * were added to cover engine enum values the spec's example list didn't
 * explicitly name — the spec itself says the list "may be extended based
 * on the existing schemas."
 */
export type CanonicalConceptId =
  | "monthly_installment"
  | "monthly_rent"
  | "annual_rent"
  | "salary"
  | "allowance"
  | "bonus"
  | "deduction"
  | "insurance_premium"
  | "deductible"
  | "coverage_limit"
  | "security_deposit"
  | "brokerage_fee"
  | "administrative_fee"
  | "annual_fee"
  | "subscription_fee"
  | "down_payment"
  | "final_payment"
  | "financing_principal"
  | "asset_value"
  | "total_repayment"
  | "financing_cost"
  | "credit_limit"
  | "minimum_payment"
  | "late_fee"
  | "early_termination_fee"
  | "collection_cost"
  | "maintenance_cost"
  | "renewal_cost"
  | "refund"
  | "tax"
  | "processing_fee"
  | "transfer_fee"
  | "registration_fee"
  | "service_fee"
  | "early_settlement_fee"
  | "cancellation_fee"
  | "returned_payment_fee"
  | "recurring_payment"
  | "one_time_payment"
  | "conditional_payment"
  | "interest_rate"
  | "outstanding_balance"
  | "other";

export type FinancialItemBucket = "guaranteed" | "conditional" | "informational";

export type FinancialItemSource = "obligation" | "fee" | "penalty" | "informational";

const STATED_CAP_KEYWORDS = [
  "up to", "maximum", "capped at", "not exceeding", "no more than",
  "حتى", "بحد أقصى", "لا يتجاوز",
];

/**
 * True when the contract's own wording frames a conditional amount as a
 * stated cap/maximum (e.g. "actual collection costs up to 500 SAR") rather
 * than a fixed, exact figure. The UI must preserve this — "up to 500 SAR",
 * never a bare "500 SAR", which would misrepresent the contract as
 * guaranteeing that exact amount.
 */
export function isStatedCapText(item: Pick<NormalizedFinancialItem, "label" | "trigger">): boolean {
  const text = `${item.label} ${item.trigger ?? ""}`.toLowerCase();
  return STATED_CAP_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
}

/** A single financial item, normalized to a common shape regardless of which backend array/type it came from. */
export interface NormalizedFinancialItem {
  id: string;
  source: FinancialItemSource;
  label: string;
  amount: MoneyMetric;
  percentage: PercentageMetric | null;
  frequency: PaymentFrequency | null;
  /** The stated installment/payment count for this item, when known (e.g. 48 monthly installments) — never derived, only ever a direct pass-through of the engine's own `numberOfPayments` field. */
  numberOfPayments: number | null;
  mandatory: boolean | null;
  conditional: boolean | null;
  refundable: boolean | null;
  financialRole: FinancialRole;
  /** Event/condition text — only ever populated for penalties. */
  trigger: string | null;
  obligationType?: ObligationType;
  feeType?: FeeType;
  penaltyType?: PenaltyType;
  informationalAmountType?: InformationalAmountType;
}

export interface FinancialConceptItem extends NormalizedFinancialItem {
  conceptId: CanonicalConceptId;
  bucket: FinancialItemBucket;
}

function normalizeObligation(o: PaymentObligation): NormalizedFinancialItem {
  return {
    id: o.id,
    source: "obligation",
    label: o.label,
    amount: o.amount,
    percentage: null,
    frequency: o.frequency,
    numberOfPayments: o.numberOfPayments,
    mandatory: o.mandatory,
    conditional: o.conditional,
    refundable: o.refundable,
    financialRole: o.financialRole,
    trigger: null,
    obligationType: o.type,
  };
}

function normalizeFee(f: FeeItem): NormalizedFinancialItem {
  return {
    id: f.id,
    source: "fee",
    label: f.label,
    amount: f.amount,
    percentage: f.percentage,
    frequency: f.frequency,
    numberOfPayments: null,
    mandatory: f.mandatory,
    conditional: f.conditional,
    refundable: f.refundable,
    financialRole: f.financialRole,
    trigger: null,
    feeType: f.type,
  };
}

function normalizePenalty(p: PenaltyItem): NormalizedFinancialItem {
  return {
    id: p.id,
    source: "penalty",
    label: p.label,
    amount: p.amount,
    percentage: p.percentage,
    frequency: null,
    numberOfPayments: null,
    mandatory: null,
    conditional: p.conditional,
    refundable: null,
    financialRole: p.financialRole,
    trigger: p.trigger,
    penaltyType: p.type,
  };
}

/**
 * Normalizes an `InformationalAmount` (a stated financing/reference fact —
 * a principal, a credit/coverage limit, income, a deductible, an
 * outstanding balance, a stated grand total, or a stated rate/APR — see
 * `@workspace/financial-metrics`'s `informationalAmounts[]`, which was
 * previously extracted internally but never exposed publicly). Never
 * mandatory/conditional in the payment sense — these are facts, not
 * obligations.
 */
function normalizeInformationalAmount(item: InformationalAmount): NormalizedFinancialItem {
  return {
    id: item.id,
    source: "informational",
    label: item.label,
    amount: item.amount,
    percentage: item.percentage,
    frequency: null,
    numberOfPayments: null,
    mandatory: null,
    conditional: null,
    refundable: null,
    financialRole: item.financialRole,
    trigger: null,
    informationalAmountType: item.type,
  };
}

/** Flattens the backend collections into one normalized list, in source-precedence order (obligations, then fees, then penalties, then informational amounts). */
export function normalizeFinancialItems(financialMetrics: FinancialMetrics): NormalizedFinancialItem[] {
  return [
    ...financialMetrics.paymentObligations.map(normalizeObligation),
    ...financialMetrics.fees.items.map(normalizeFee),
    ...financialMetrics.penalties.items.map(normalizePenalty),
    ...financialMetrics.informationalAmounts.map(normalizeInformationalAmount),
  ];
}

const RENT_KEYWORDS = ["rent", "إيجار"];
const ADMINISTRATIVE_KEYWORDS = ["administrative", "admin fee", "إداري", "رسوم إدارية"];
const BROKERAGE_KEYWORDS = ["brokerage", "broker", "وساطة", "سمسرة"];
const SALARY_KEYWORDS = ["salary", "wage", "راتب", "أجر"];
const ALLOWANCE_KEYWORDS = ["allowance", "بدل"];
const BONUS_KEYWORDS = ["bonus", "مكافأة"];
const LATE_KEYWORDS = ["late", "overdue", "تأخير"];
const EARLY_TERMINATION_KEYWORDS = ["early termination", "termination fee", "إنهاء مبكر", "إنهاء العقد"];
const EARLY_SETTLEMENT_KEYWORDS = ["early settlement", "early repayment", "سداد مبكر", "التسوية المبكرة"];
const COLLECTION_KEYWORDS = ["collection", "تحصيل"];
const CANCELLATION_KEYWORDS = ["cancellation", "إلغاء"];
const RETURNED_PAYMENT_KEYWORDS = ["returned payment", "bounced", "شيك مرتجع"];
const FINAL_PAYMENT_KEYWORDS = ["final payment", "balloon", "residual value", "دفعة ختامية", "القيمة المتبقية"];
const FINANCING_COST_KEYWORDS = ["financing cost", "cost of financing", "تكلفة التمويل"];

function labelContainsAny(label: string, keywords: readonly string[]): boolean {
  const normalized = label.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

/**
 * A flat, role-agnostic label-keyword pass — checked before any
 * role/frequency-based branching. This is what lets two representations of
 * the SAME real concept resolve to the same id even when the engine gave
 * them different roles/types (e.g. an administrative fee reported once as
 * a generic, unclassified `financialObligations[]` item — `obligationType:
 * "unknown"`, `financialRole: "other"` — and once as a proper `fees[]`
 * item with `feeType: "administration"`): the label itself names the
 * concept clearly enough to resolve both to `administrative_fee`,
 * regardless of which array either one came from.
 */
function resolveGenericLabelConcept(item: NormalizedFinancialItem): CanonicalConceptId | null {
  if (labelContainsAny(item.label, ADMINISTRATIVE_KEYWORDS)) return "administrative_fee";
  if (labelContainsAny(item.label, BROKERAGE_KEYWORDS)) return "brokerage_fee";
  if (labelContainsAny(item.label, FINANCING_COST_KEYWORDS)) return "financing_cost";
  if (labelContainsAny(item.label, FINAL_PAYMENT_KEYWORDS)) return "final_payment";
  if (labelContainsAny(item.label, RENT_KEYWORDS)) return item.frequency === "annual" ? "annual_rent" : "monthly_rent";
  if (labelContainsAny(item.label, SALARY_KEYWORDS)) return "salary";
  if (labelContainsAny(item.label, ALLOWANCE_KEYWORDS)) return "allowance";
  if (labelContainsAny(item.label, BONUS_KEYWORDS)) return "bonus";
  if (labelContainsAny(item.label, LATE_KEYWORDS)) return "late_fee";
  if (labelContainsAny(item.label, EARLY_TERMINATION_KEYWORDS)) return "early_termination_fee";
  if (labelContainsAny(item.label, EARLY_SETTLEMENT_KEYWORDS)) return "early_settlement_fee";
  if (labelContainsAny(item.label, COLLECTION_KEYWORDS)) return "collection_cost";
  if (labelContainsAny(item.label, CANCELLATION_KEYWORDS)) return "cancellation_fee";
  if (labelContainsAny(item.label, RETURNED_PAYMENT_KEYWORDS)) return "returned_payment_fee";
  return null;
}

const RECURRING_INSTALLMENT_CONTRACT_TYPES: ReadonlySet<ContractType> = new Set([
  "auto_finance",
  "personal_finance",
  "mortgage",
]);

/**
 * Disambiguates the engine's generic `recurring_payment`/`recurring_outflow`
 * role using contract-type context, once `resolveGenericLabelConcept` has
 * already had a chance to resolve it from the label itself — the engine's
 * own enum does not distinguish "installment" from "rent" from
 * "subscription fee", so contract type is the next-best generic signal.
 */
function resolveRecurringConceptByContractType(contractType: ContractType, frequency: PaymentFrequency | null): CanonicalConceptId {
  if (RECURRING_INSTALLMENT_CONTRACT_TYPES.has(contractType)) return "monthly_installment";
  if (contractType === "lease") return frequency === "annual" ? "annual_rent" : "monthly_rent";
  if (contractType === "subscription") return "subscription_fee";
  if (contractType === "credit_card") return "minimum_payment";
  if (contractType === "employment") return "salary";
  if (contractType === "insurance") return "insurance_premium";
  return "recurring_payment";
}

const OBLIGATION_TYPE_CONCEPTS: Partial<Record<ObligationType, CanonicalConceptId>> = {
  upfront_payment: "down_payment",
  deposit: "security_deposit",
  insurance: "insurance_premium",
  tax: "tax",
  balloon_payment: "final_payment",
};

const FEE_TYPE_CONCEPTS: Partial<Record<FeeType, CanonicalConceptId>> = {
  administration: "administrative_fee",
  processing: "processing_fee",
  subscription: "subscription_fee",
  insurance: "insurance_premium",
  maintenance: "maintenance_cost",
  transfer: "transfer_fee",
  registration: "registration_fee",
  service: "service_fee",
  renewal: "renewal_cost",
  tax: "tax",
};

const PENALTY_TYPE_CONCEPTS: Partial<Record<PenaltyType, CanonicalConceptId>> = {
  late_payment: "late_fee",
  early_termination: "early_termination_fee",
  early_settlement: "early_settlement_fee",
  default: "collection_cost",
  cancellation: "cancellation_fee",
  returned_payment: "returned_payment_fee",
};

/**
 * Maps the engine's `InformationalAmountType` (a structured, unambiguous
 * classification — see `@workspace/financial-metrics`'s
 * `informationalAmounts[]`) directly to a canonical concept id. `"other"`
 * is used deliberately for `outstanding_balance`/`stated_total_cost`: a
 * contract can state more than one distinct grand total (e.g. "Total of
 * Payments during the term" vs "Total repayment amount"), so forcing both
 * under one generic canonical label would conflate genuinely different
 * stated figures — each keeps its own sanitized, contract-specific label
 * instead (see `resolveCanonicalConcept`'s "other" handling in the UI layer).
 */
const INFORMATIONAL_TYPE_CONCEPTS: Record<InformationalAmountType, CanonicalConceptId> = {
  principal: "financing_principal",
  credit_limit: "credit_limit",
  coverage_amount: "coverage_limit",
  insurance_deductible: "deductible",
  monthly_income: "salary",
  outstanding_balance: "other",
  stated_total_cost: "other",
  rate: "interest_rate",
  asset_value: "asset_value",
  // A recurring obligation restated at another cadence (e.g. a lease's
  // annual rent alongside its monthly rent) — reuses the existing
  // `annual_rent` concept/label so it displays exactly like any other
  // annual-rent fact, while never being a `PaymentObligation` itself (see
  // `@workspace/financial-metrics`'s `applyRecurringEquivalenceReclassification`).
  annual_equivalent: "annual_rent",
  // A contract's own stated total due at signing — shown under its own
  // stated label ("other"), never merged into a fee/obligation concept.
  stated_due_at_signing: "other",
  // One individual guaranteed salary component (base salary, a housing/
  // transportation allowance, ...) — mapped to "other" deliberately, so
  // `conceptLabel()` (ContractFinancesTab.tsx) shows each component's own
  // specific stated label ("Base salary", "Housing allowance", ...)
  // instead of one shared generic label that would erase the distinction.
  salary_component: "other",
  // An employment contract's own stated total fixed monthly compensation —
  // shown under its own stated label, same rationale as `salary_component`.
  total_fixed_compensation: "other",
};

/**
 * Resolves a normalized item to a canonical concept id, in priority order:
 * (1) the engine's own structured `informationalAmountType`/`type`/
 * `feeType`/`penaltyType` enum when it maps unambiguously — the strongest,
 * most structured signal; (2) a flat label-keyword match — checked
 * regardless of role/type, since this is what lets two representations of
 * the same real concept (one an unclassified generic obligation, one a
 * properly-typed fee) resolve to the same id even when the engine gave them
 * different types/roles; (3) contract-type context for the engine's two
 * genuinely generic roles (`recurring_outflow`/`one_time_outflow`); (4) a
 * direct role mapping for everything else. Never resolves by amount matching.
 */
export function resolveCanonicalConcept(item: NormalizedFinancialItem, contractType: ContractType): CanonicalConceptId {
  if (item.informationalAmountType) {
    return INFORMATIONAL_TYPE_CONCEPTS[item.informationalAmountType];
  }
  if (item.obligationType && item.obligationType in OBLIGATION_TYPE_CONCEPTS) {
    return OBLIGATION_TYPE_CONCEPTS[item.obligationType]!;
  }
  if (item.feeType && item.feeType in FEE_TYPE_CONCEPTS) {
    return FEE_TYPE_CONCEPTS[item.feeType]!;
  }
  if (item.penaltyType && item.penaltyType in PENALTY_TYPE_CONCEPTS) {
    return PENALTY_TYPE_CONCEPTS[item.penaltyType]!;
  }

  const genericLabelConcept = resolveGenericLabelConcept(item);
  if (genericLabelConcept !== null) {
    return genericLabelConcept;
  }

  // A penalty-sourced item can flow TO the user in an employment contract
  // (e.g. termination compensation the employer owes the employee) rather
  // than being a cost the user pays — `source === "penalty"` alone must
  // never force it into "conditional_payment", or it would both mislabel
  // the direction and let it collide (by amount) with an unrelated
  // employee-owed deduction. It falls through to "other" below instead, the
  // same resolution already used for every other conditional-income item.
  if (item.source === "penalty" && item.financialRole !== "conditional_income") {
    return "conditional_payment";
  }
  if (item.financialRole === "conditional_cost") {
    return "conditional_payment";
  }
  if (item.financialRole === "recurring_outflow") {
    return resolveRecurringConceptByContractType(contractType, item.frequency);
  }
  if (item.financialRole === "one_time_outflow" || item.financialRole === "upfront_liquidity") {
    return "one_time_payment";
  }
  if (item.financialRole === "refundable") {
    return "security_deposit";
  }
  if (item.financialRole === "credit_limit") return "credit_limit";
  if (item.financialRole === "coverage_limit") return "coverage_limit";
  if (item.financialRole === "financing_principal") return "financing_principal";
  if (item.financialRole === "asset_value") return "asset_value";
  if (item.financialRole === "income") return "salary";
  if (item.financialRole === "refund") return "refund";

  return "other";
}

const INFORMATIONAL_ROLES: ReadonlySet<FinancialRole> = new Set([
  "income",
  "credit_limit",
  "coverage_limit",
  "asset_value",
  "benefit",
  "refund",
  "rate_or_percentage",
  "informational_total",
  "financing_principal",
  "deduction",
]);

/**
 * Buckets a normalized item into exactly one of: `guaranteed` (a known,
 * non-conditional outflow), `conditional` (event-based/contingent — always
 * includes every penalty), or `informational` (income, a credit/coverage
 * limit, an asset value, a financing principal, ... — never a real user
 * cost, never summed into any total or budget-impact outflow).
 *
 * Critical rule: an item only ever becomes `guaranteed` when `mandatory` is
 * *explicitly* `true`. Previously, an item with an unresolved role and an
 * unset (`null`) `mandatory` field silently fell through to `guaranteed` —
 * this was the root cause of ambiguous/unclassified stated facts (e.g. a
 * generic `extractedNumbers[]`-sourced line with no explicit
 * mandatory/optional signal) being summed as if they were confirmed costs.
 * A genuinely mandatory obligation or fee always has `mandatory: true` set
 * by the engine by the time it reaches here (see
 * `pipeline/candidates.ts`/`pipeline/classify.ts`) — this only changes
 * behavior for the narrow, genuinely ambiguous case.
 */
export function classifyFinancialItemBucket(item: NormalizedFinancialItem): FinancialItemBucket {
  if (INFORMATIONAL_ROLES.has(item.financialRole)) {
    return "informational";
  }
  if (item.financialRole === "conditional_cost" || item.conditional === true) {
    return "conditional";
  }
  return item.mandatory === true ? "guaranteed" : "informational";
}

function hasRenderableAmount(item: NormalizedFinancialItem): boolean {
  if (item.amount.status !== "unavailable" && item.amount.value !== null) {
    return true;
  }
  return item.percentage !== null && item.percentage.status !== "unavailable" && item.percentage.value !== null;
}

function dedupKey(conceptId: CanonicalConceptId, currency: string | null, amountValue: number | null): string | null {
  // "other" is a catch-all bucket, not a specific semantic fact — two "other"
  // items sharing an amount are not necessarily the same fact (e.g. an
  // employment contract's notice-period deduction and termination
  // compensation can both be 24,000 SAR while representing opposite-direction
  // facts). Only a concept id that resolved to something specific is a safe
  // basis for merging by amount alone.
  if (conceptId === "other" || currency === null || amountValue === null || amountValue === 0) {
    return null;
  }
  return `${conceptId}|${currency}|${amountValue.toFixed(2)}`;
}

/**
 * The full pipeline: normalize -> resolve concept -> deduplicate (by
 * concept id + currency + rounded amount, source-precedence order
 * obligations > fees > penalties, so two representations of the same real
 * concept collapse to one row regardless of which array or which raw
 * frequency string each happened to carry) -> classify bucket. Items with
 * no renderable amount or percentage at all are dropped entirely (never
 * shown as "unavailable").
 */
export function buildFinancialConcepts(financialMetrics: FinancialMetrics, contractType: ContractType): FinancialConceptItem[] {
  const normalized = normalizeFinancialItems(financialMetrics).filter(hasRenderableAmount);

  const seenKeys = new Set<string>();
  const deduped: NormalizedFinancialItem[] = [];
  for (const item of normalized) {
    const conceptId = resolveCanonicalConcept(item, contractType);
    const key = dedupKey(conceptId, item.amount.currency, item.amount.value);
    if (key !== null) {
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
    }
    deduped.push(item);
  }

  return deduped.map((item) => ({
    ...item,
    conceptId: resolveCanonicalConcept(item, contractType),
    bucket: classifyFinancialItemBucket(item),
  }));
}

const RECURRING_FREQUENCY_FACTORS: Partial<Record<PaymentFrequency, number>> = {
  daily: 365 / 12,
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  semi_annual: 1 / 6,
  annual: 1 / 12,
};

export interface CurrencyAmount {
  value: number;
  currency: string;
}

/**
 * The applicable monthly outflow for Financial Analysis: the sum of every
 * `guaranteed`-bucket item whose role is `recurring_outflow`, converted to
 * its monthly equivalent. Deliberately recomputed from the deduplicated
 * concept list (not `recurringCommitment.monthlyEquivalent` alone) because
 * that engine field only ever considers `paymentObligations` — a mandatory
 * recurring fee reported under `fees[]` (e.g. a monthly service fee with no
 * dedicated `typeDetails` field) would otherwise be silently missed for any
 * contract type. Returns `null` when nothing qualifies, or when qualifying
 * items span more than one currency (never silently combined).
 */
export function selectApplicableMonthlyOutflow(concepts: readonly FinancialConceptItem[]): CurrencyAmount | null {
  const qualifying = concepts.filter(
    (item) => item.bucket === "guaranteed" && item.financialRole === "recurring_outflow" && item.amount.value !== null && item.amount.currency !== null,
  );
  if (qualifying.length === 0) {
    return null;
  }
  const currencies = new Set(qualifying.map((item) => item.amount.currency));
  if (currencies.size > 1) {
    return null;
  }
  let total = 0;
  for (const item of qualifying) {
    const factor = item.frequency ? RECURRING_FREQUENCY_FACTORS[item.frequency] : undefined;
    if (factor === undefined) {
      continue;
    }
    total += (item.amount.value as number) * factor;
  }
  return total > 0 ? { value: total, currency: [...currencies][0] as string } : null;
}

/**
 * The applicable upfront liquidity requirement for Financial Analysis: the
 * sum of every `guaranteed`-bucket item whose role is `upfront_liquidity`
 * or `refundable`. `upfront_liquidity` covers every amount the engine has
 * confirmed is due at signing/contract start from explicit timing wording —
 * a down payment, a mandatory signing/administrative fee, a brokerage fee
 * due at signing, an initial premium, an activation/setup fee, and so on
 * (see `pipeline/semantics.ts`'s `toFinancialRole` in `@workspace/financial-metrics`,
 * which only assigns this role to a one-time mandatory amount when the
 * contract text explicitly confirms it is due now). `refundable` covers a
 * refundable deposit, which still consumes cash *now* even though it may be
 * returned later.
 *
 * Deliberately does NOT include the generic `one_time_outflow` role: that
 * role now means "a one-time guaranteed amount whose due-now timing is
 * either explicitly due later (a final/balloon payment, a future renewal
 * fee) or genuinely unstated" — since the engine can no longer distinguish
 * "due now" from "timing unknown" without an explicit signal, this selector
 * must never assume either one is upfront. This also means a final/balloon
 * payment is excluded automatically, by role, with no hardcoded concept-id
 * exception needed here.
 */
function sumKnownAmounts(items: readonly FinancialConceptItem[]): { total: number; currency: string | null } | null {
  const known = items.filter((item) => item.amount.value !== null && item.amount.currency !== null);
  if (known.length === 0) {
    return null;
  }
  const currencies = new Set(known.map((item) => item.amount.currency));
  if (currencies.size > 1) {
    return null;
  }
  return { total: known.reduce((sum, item) => sum + (item.amount.value as number), 0), currency: [...currencies][0] as string };
}

const AMOUNT_CONSISTENCY_EPSILON = 0.01;

export function selectApplicableUpfrontLiquidity(
  concepts: readonly FinancialConceptItem[],
  contractType?: ContractType,
): CurrencyAmount | null {
  const qualifying = concepts.filter(
    (item) =>
      item.bucket === "guaranteed" &&
      (item.financialRole === "upfront_liquidity" || item.financialRole === "refundable") &&
      item.amount.value !== null &&
      item.amount.currency !== null,
  );
  const narrow = sumKnownAmounts(qualifying);
  const narrowResult = narrow && narrow.total > 0 && narrow.currency !== null ? { value: narrow.total, currency: narrow.currency } : null;

  // A contract's own stated "total due at signing" is preferred over the
  // narrower reconstruction above ONLY when it is arithmetically consistent
  // with a wider, still-conservative reconstruction of what is genuinely
  // paid now — this never invents a figure, it only trusts the contract's
  // own stated total once it is corroborated by the contract's own itemized
  // facts. The wider reconstruction additionally includes: (a) every
  // guaranteed one-time item whose due-now timing wasn't explicitly
  // restated (role `one_time_outflow`) — a flat one-time fee with no
  // renewal/end-of-term wording is virtually always paid at signing; and
  // (b) for a lease specifically, one monthly-rent-equivalent payment,
  // since a lease's first rent payment is conventionally due at signing
  // alongside the deposit/fees, in addition to being the first of the
  // recurring schedule (see the product requirement this encodes: the
  // first month's rent affects immediate liquidity without ever being
  // double-counted in the recurring commitment or total cost).
  const statedDueAtSigning = concepts.find(
    (item) => item.informationalAmountType === "stated_due_at_signing" && item.amount.value !== null && item.amount.currency !== null,
  );
  if (statedDueAtSigning) {
    const oneTimeOutflowItems = concepts.filter(
      (item) => item.bucket === "guaranteed" && item.financialRole === "one_time_outflow" && item.amount.value !== null && item.amount.currency !== null,
    );
    const wideItems = [...qualifying, ...oneTimeOutflowItems];
    if (contractType === "lease") {
      const monthlyRent = concepts.find(
        (item) =>
          item.bucket === "guaranteed" &&
          item.financialRole === "recurring_outflow" &&
          item.conceptId === "monthly_rent" &&
          item.amount.value !== null &&
          item.amount.currency !== null,
      );
      if (monthlyRent) {
        wideItems.push(monthlyRent);
      }
    }
    const wide = sumKnownAmounts(wideItems);
    if (
      wide &&
      wide.currency !== null &&
      wide.currency === statedDueAtSigning.amount.currency &&
      Math.abs(wide.total - (statedDueAtSigning.amount.value as number)) < AMOUNT_CONSISTENCY_EPSILON
    ) {
      return { value: wide.total, currency: wide.currency };
    }
  }

  return narrowResult;
}

/**
 * The canonical guaranteed monthly employment income (see
 * `@workspace/financial-metrics`'s `applyEmploymentClassification`, which
 * synthesizes exactly one `monthly_income`-typed informational amount for
 * an employment contract — preferring a stated total fixed compensation
 * fact when consistent with the sum of guaranteed salary components,
 * otherwise the component sum itself). Returns `null` when the contract
 * states no guaranteed compensation at all.
 */
export function selectGuaranteedEmploymentIncome(concepts: readonly FinancialConceptItem[]): CurrencyAmount | null {
  const canonical = concepts.find(
    (item) => item.informationalAmountType === "monthly_income" && item.amount.value !== null && item.amount.currency !== null,
  );
  if (!canonical) {
    return null;
  }
  return { value: canonical.amount.value as number, currency: canonical.amount.currency as string };
}

// ---------------------------------------------------------------------------
// Employment-only financial grouping ("Your Compensation") — an employment
// contract's money flows in fundamentally different directions than every
// other contract type (income, not cost), so it gets its own dedicated
// 5-group model instead of the generic 6-group `ContractFinancialGroup`
// above. Used only when `contractType === "employment"` (see
// `ContractFinancesTab.tsx`) — every other contract type's grouping is
// completely unaffected.
// ---------------------------------------------------------------------------

export type EmploymentFinancialGroup =
  | "whatYouWillReceive"
  | "compensationBreakdown"
  | "conditionalOrNonGuaranteed"
  | "potentialDeductions"
  | "otherBenefits";

/**
 * Classifies a single financial concept item into one of the 5 employment-
 * specific display groups. Priority order: (1) the canonical guaranteed
 * total ("What you will receive"); (2) an individual guaranteed salary
 * component ("Compensation breakdown"); (3) a conditional amount that flows
 * TO the employee — a bonus, or a termination-compensation entitlement
 * ("Conditional or non-guaranteed amounts"); (4) a conditional amount owed
 * BY the employee — a notice-period deduction, a statutory/social-insurance
 * deduction ("Potential deductions or obligations"); (5) a non-cash/
 * qualitative benefit ("Other benefits"); (6) anything else, by its own
 * bucket, as a safe fallback.
 */
export function resolveEmploymentFinancialGroup(item: FinancialConceptItem): EmploymentFinancialGroup {
  if (item.informationalAmountType === "monthly_income") {
    return "whatYouWillReceive";
  }
  if (item.informationalAmountType === "salary_component" || item.informationalAmountType === "total_fixed_compensation") {
    return "compensationBreakdown";
  }
  if (item.financialRole === "conditional_income") {
    return "conditionalOrNonGuaranteed";
  }
  if (item.financialRole === "conditional_cost") {
    return "potentialDeductions";
  }
  if (item.financialRole === "benefit") {
    return "otherBenefits";
  }
  if (item.bucket === "guaranteed") {
    return "compensationBreakdown";
  }
  if (item.bucket === "conditional") {
    return "conditionalOrNonGuaranteed";
  }
  return "otherBenefits";
}

/**
 * Groups an already-built, deduplicated concept list by employment display
 * group, dropping any group that ends up empty — same convention as
 * `groupContractFinancialConcepts`.
 */
export function groupEmploymentFinancialConcepts(
  concepts: readonly FinancialConceptItem[],
): Partial<Record<EmploymentFinancialGroup, FinancialConceptItem[]>> {
  const groups: Partial<Record<EmploymentFinancialGroup, FinancialConceptItem[]>> = {};
  for (const item of concepts) {
    const group = resolveEmploymentFinancialGroup(item);
    (groups[group] ??= []).push(item);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Contract Finances ("Your Money") — a structured presentation of financial
// facts explicitly stated in the contract, never a calculator. No function
// below sums, totals, or otherwise derives a new figure from other stated
// facts (that composition was `buildKnownCashOutflow`, now removed — a
// contract-stated total must be shown only when the contract itself states
// it, as its own `stated_total_cost`/`total_repayment` concept, never
// reconstructed from unrelated line items). Every item is grouped purely by
// its own semantic meaning (role/concept), never by contract type.
// ---------------------------------------------------------------------------

export type ContractFinancialGroup =
  | "whatYoullPay"
  | "feesAndCosts"
  | "conditionalAmounts"
  | "financingAndCredit"
  | "ratesAndPercentages"
  | "otherStatedAmounts";

/** Concept ids that are always presented as a fee/cost regardless of their bucket (except conditional ones, which take priority — see `resolveContractFinancialGroup`). */
const FEE_LIKE_CONCEPT_IDS: ReadonlySet<CanonicalConceptId> = new Set([
  "administrative_fee",
  "processing_fee",
  "brokerage_fee",
  "service_fee",
  "maintenance_cost",
  "renewal_cost",
  "registration_fee",
  "transfer_fee",
  "subscription_fee",
  "annual_fee",
  "insurance_premium",
  "financing_cost",
]);

const FINANCING_OR_CREDIT_ROLES: ReadonlySet<FinancialRole> = new Set([
  "financing_principal",
  "credit_limit",
  "coverage_limit",
]);

/**
 * Classifies a single financial concept item into one of the 6 generic
 * semantic display groups — driven entirely by the item's own resolved
 * role/concept, never by the contract's type. Priority order: (1) a
 * conditional/potential amount always goes to `conditionalAmounts`,
 * regardless of what kind of concept it is (a fee, a penalty, a deductible
 * — a collection cost cap must never be shown as if guaranteed); (2) a
 * financing/credit reference figure (principal, credit limit, coverage
 * limit); (3) a stated rate/percentage; (4) a recognized fee/cost concept;
 * (5) a guaranteed payment the user will actually make; (6) everything else
 * stated in the contract that doesn't fit the above (income, an asset
 * value, a stated grand total, ...).
 */
export function resolveContractFinancialGroup(item: FinancialConceptItem): ContractFinancialGroup {
  if (item.bucket === "conditional") {
    return "conditionalAmounts";
  }
  if (FINANCING_OR_CREDIT_ROLES.has(item.financialRole)) {
    return "financingAndCredit";
  }
  if (item.financialRole === "rate_or_percentage") {
    return "ratesAndPercentages";
  }
  if (FEE_LIKE_CONCEPT_IDS.has(item.conceptId)) {
    return "feesAndCosts";
  }
  if (item.bucket === "guaranteed") {
    return "whatYoullPay";
  }
  return "otherStatedAmounts";
}

/**
 * Groups an already-built, deduplicated concept list by semantic display
 * group, dropping any group that ends up empty (a contract's Your Money tab
 * must only ever show sections it actually has facts for).
 */
export function groupContractFinancialConcepts(
  concepts: readonly FinancialConceptItem[],
): Partial<Record<ContractFinancialGroup, FinancialConceptItem[]>> {
  const groups: Partial<Record<ContractFinancialGroup, FinancialConceptItem[]>> = {};
  for (const item of concepts) {
    const group = resolveContractFinancialGroup(item);
    (groups[group] ??= []).push(item);
  }
  return groups;
}

/** A stated duration or payment-count fact — read directly from the engine's own `contractDuration`/`numberOfPayments` fields, never derived from other numbers. */
export interface DurationFact {
  kind: "contractDuration" | "installmentCount";
  /** For `contractDuration`: the duration value. For `installmentCount`: the number of payments. */
  value: number;
  /** Only meaningful for `kind: "contractDuration"`. */
  unit?: "days" | "months" | "years";
  /** Only meaningful for `kind: "installmentCount"` — which concept this count belongs to (e.g. the monthly installment). */
  conceptId?: CanonicalConceptId;
}

/**
 * Builds the "Durations & counts" (المدد وعدد الدفعات) facts — the
 * contract's own stated duration and any guaranteed recurring payment's
 * stated installment count. Both are direct, stated engine fields
 * (`contractDuration`, `paymentObligation.numberOfPayments`) that were
 * previously never surfaced in Contract Finances at all; neither is
 * computed here.
 */
export function buildDurationFacts(financialMetrics: FinancialMetrics, concepts: readonly FinancialConceptItem[]): DurationFact[] {
  const facts: DurationFact[] = [];
  const duration = financialMetrics.contractDuration;

  if (duration.status !== "unavailable") {
    if (duration.months !== null) {
      facts.push({ kind: "contractDuration", value: duration.months, unit: "months" });
    } else if (duration.unit === "years" && duration.value !== null) {
      facts.push({ kind: "contractDuration", value: duration.value, unit: "years" });
    } else if (duration.days !== null) {
      facts.push({ kind: "contractDuration", value: duration.days, unit: "days" });
    }
  }

  for (const item of concepts) {
    if (item.bucket === "guaranteed" && item.numberOfPayments !== null && item.numberOfPayments > 0) {
      facts.push({ kind: "installmentCount", value: item.numberOfPayments, conceptId: item.conceptId });
    }
  }

  return facts;
}
