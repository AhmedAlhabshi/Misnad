import type { ContractUnderstanding } from "@workspace/contract-schema";
import type { Confidence, FeeType, ObligationType, PaymentFrequency, PenaltyType } from "../enums";
import { normalizeCurrencyCode, sanitizeNumericAmount } from "../normalize/money";
import { isPercentCurrencyText, normalizePercentageValue } from "../normalize/percentages";
import { classifyFrequencyText } from "../normalize/text";
import {
  classifyFeeTypeText,
  classifyObligationTypeText,
  classifyPenaltyTypeText,
  classifyScenarioContext,
  inferConditionalFromText,
  inferMandatoryFromText,
  inferPaymentTimingFromText,
  inferRefundableFromText,
  isAssetValueText,
  isScenarioBalanceText,
  isStatedTotalCostText,
  type PaymentTiming,
} from "./classify";
import type { CandidateContext, CandidateSemanticRole } from "./semantics";

/** Obligation types that are structurally one-time by their very nature — used to keep frequency classification consistent across sources (see `withOneTimeFrequencyDefault`). */
const INHERENTLY_ONE_TIME_OBLIGATION_TYPES = new Set<ObligationType>([
  "upfront_payment",
  "balloon_payment",
  "deposit",
  "one_time_payment",
]);

/**
 * Stage 1 of frequency resolution: every available *text* signal (a
 * dedicated frequency field first, then the description/label itself,
 * since Milestone 4's free-text `frequency` field is often left empty even
 * when the description clearly states a cadence, e.g. "Monthly
 * installment"). Computed before obligation-type classification, since
 * `classifyObligationTypeText` itself takes the resolved frequency as one
 * of its inputs.
 */
function resolveTextFrequency(
  explicitFrequencyText: string | null | undefined,
  descriptionText: string | null | undefined,
): PaymentFrequency | null {
  return classifyFrequencyText(explicitFrequencyText) ?? classifyFrequencyText(descriptionText);
}

/**
 * Stage 2: once the obligation type is known, a still-unresolved frequency
 * defaults to `"one_time"` for obligation types that are inherently
 * one-time (a down payment, balloon payment, or deposit is one-time by its
 * very nature, regardless of whether the source text happened to restate
 * that). This keeps a `typeDetails`-sourced candidate (always has an
 * explicit hardcoded frequency) and a generic `financialObligations[]`/
 * `extractedNumbers[]` candidate for the *same* concept from silently
 * ending up with mismatched frequencies purely because the free-text
 * source never restated it — which would otherwise defeat deduplication.
 */
function withOneTimeFrequencyFallback(
  frequency: PaymentFrequency | null,
  obligationType: ObligationType,
): PaymentFrequency | null {
  if (frequency !== null) {
    return frequency;
  }
  return INHERENTLY_ONE_TIME_OBLIGATION_TYPES.has(obligationType) ? "one_time" : null;
}

export type CandidateTargetKind = "obligation" | "fee" | "penalty" | "special";

export type SpecialValueKey =
  | "principal"
  | "creditLimit"
  | "outstandingBalance"
  | "monthlyIncome"
  | "statedTotalCost"
  | "insuranceDeductible"
  | "coverageAmount"
  | "rate";

export type CandidateSourceKind =
  | "type_details"
  | "financial_obligation"
  | "fee_item"
  | "penalty_item"
  | "extracted_number";

/**
 * An internal, not-publicly-exposed representation of a single financial
 * data point recovered from `ContractUnderstanding`, before
 * classification/dedup/conflict-resolution have run. Retains enough
 * provenance (source kind/field, evidence, confidence) to support every
 * later pipeline stage.
 */
export interface Candidate {
  targetKind: CandidateTargetKind;
  specialKey?: SpecialValueKey;
  obligationType?: ObligationType;
  feeType?: FeeType;
  penaltyType?: PenaltyType;
  /**
   * What this candidate actually *is*, independent of which Milestone 4
   * array it came from — computed once, after extraction, by
   * `assignSemantics` (see below). Determines whether it can ever become a
   * `PaymentObligation` and whether it counts toward normal-path exposure.
   */
  semanticRole: CandidateSemanticRole;
  /** Which "path" through the contract this candidate belongs to — only `normal_contract_path` amounts feed guaranteed/known cost, exposure, or `maximumSinglePayment`. */
  context: CandidateContext;
  label: string;
  amountValue: number | null;
  currency: string | null;
  percentageValue: number | null;
  frequency: PaymentFrequency | null;
  numberOfPayments: number | null;
  startDate: string | null;
  endDate: string | null;
  mandatory: boolean | null;
  conditional: boolean | null;
  refundable: boolean | null;
  /**
   * Explicit signal, from the contract's own wording, of whether a one-time
   * amount is due now (at signing/contract start) or due later — `null`
   * when the text states neither. Only ever set from real timing wording
   * (see `inferPaymentTimingFromText`), never inferred from fee/obligation
   * type or amount, so a one-time cost with unstated timing never silently
   * becomes an upfront liquidity deduction.
   */
  paymentTiming: PaymentTiming | null;
  calculationBase: string | null;
  trigger: string | null;
  sourceKind: CandidateSourceKind;
  sourceField: string;
  evidence: string | null;
  confidence: Confidence;
}

function baseCandidate(sourceKind: CandidateSourceKind, sourceField: string): Omit<
  Candidate,
  "targetKind" | "label" | "amountValue" | "currency"
> {
  return {
    semanticRole: "unknown",
    context: "normal_contract_path",
    percentageValue: null,
    frequency: null,
    numberOfPayments: null,
    startDate: null,
    endDate: null,
    mandatory: null,
    conditional: null,
    refundable: null,
    paymentTiming: null,
    calculationBase: null,
    trigger: null,
    sourceKind,
    sourceField,
    evidence: null,
    confidence: sourceKind === "type_details" ? "high" : sourceKind === "extracted_number" ? "low" : "medium",
  };
}

function fromTypeDetailsAmount(
  sourceField: string,
  label: string,
  value: number | null,
  extra: Partial<Candidate>,
): Candidate | null {
  const amountValue = sanitizeNumericAmount(value);
  if (amountValue === null) {
    return null;
  }
  return {
    ...baseCandidate("type_details", sourceField),
    targetKind: "obligation",
    label,
    amountValue,
    currency: null,
    evidence: label,
    ...extra,
  };
}

/**
 * Sibling to `fromTypeDetailsAmount` for a stated percentage/rate fact (e.g.
 * an APR or interest rate) rather than a currency amount — routes the value
 * into `percentageValue` instead of `amountValue`/`currency`. Always
 * `targetKind: "special"` since a rate is never itself a payment obligation.
 */
function fromTypeDetailsPercentage(
  sourceField: string,
  label: string,
  value: number | null,
  extra: Partial<Candidate>,
): Candidate | null {
  const percentageValue = sanitizeNumericAmount(value);
  if (percentageValue === null) {
    return null;
  }
  return {
    ...baseCandidate("type_details", sourceField),
    targetKind: "special",
    specialKey: "rate",
    label,
    amountValue: null,
    currency: null,
    percentageValue,
    evidence: label,
    ...extra,
  };
}

function extractFromFinancialObligations(input: ContractUnderstanding): Candidate[] {
  return input.financialObligations.map((obligation, index) => {
    const amountValue = sanitizeNumericAmount(obligation.amount);
    const textFrequency = resolveTextFrequency(obligation.frequency, obligation.description);
    const obligationType = classifyObligationTypeText(textFrequency, obligation.description);
    const frequency = withOneTimeFrequencyFallback(textFrequency, obligationType);
    const explicitMandatory = inferMandatoryFromText(obligation.description);
    const conditional = inferConditionalFromText(obligation.description);
    // A listed financial obligation is presumed part of the normal course of
    // the contract (mandatory) unless the text explicitly says otherwise or
    // flags a conditional trigger — unlike fees/penalties, which are
    // conservatively left unknown by default (see extractFromFees/Penalties).
    const mandatory = explicitMandatory !== null ? explicitMandatory : conditional === true ? false : true;
    return {
      ...baseCandidate("financial_obligation", `financialObligations[${index}]`),
      targetKind: "obligation" as const,
      obligationType,
      label: obligation.description,
      amountValue,
      currency: normalizeCurrencyCode(obligation.currency),
      frequency,
      mandatory,
      conditional,
      // Only meaningful for obligationType "deposit" — see calculators/costs.ts's
      // tri-state handling — but harmless to compute for every obligation.
      refundable: inferRefundableFromText(obligation.description),
      paymentTiming: inferPaymentTimingFromText(obligation.description),
      startDate: obligation.dueDate,
      evidence: obligation.description,
    };
  });
}

function extractFromFees(input: ContractUnderstanding): Candidate[] {
  return input.fees.map((fee, index) => {
    const amountValue = sanitizeNumericAmount(fee.amount);
    const textFrequency = classifyFrequencyText(fee.description);
    return {
      ...baseCandidate("fee_item", `fees[${index}]`),
      targetKind: "fee" as const,
      feeType: classifyFeeTypeText(fee.description),
      label: fee.description,
      amountValue,
      currency: normalizeCurrencyCode(fee.currency),
      frequency: fee.isRecurring === false ? "one_time" : textFrequency,
      mandatory: inferMandatoryFromText(fee.description),
      conditional: inferConditionalFromText(fee.description),
      refundable: inferRefundableFromText(fee.description),
      paymentTiming: inferPaymentTimingFromText(fee.description),
      evidence: fee.description,
    };
  });
}

function extractFromPenalties(input: ContractUnderstanding): Candidate[] {
  return input.penalties.map((penalty, index) => {
    // The schema has no dedicated percentage field for penalties, so a
    // percent-denominated penalty (e.g. "6% of the installment value") comes
    // back as `{ amount: 6, currency: "%" }`. Routing that into
    // `percentageValue` (and leaving `amountValue`/`currency` both null)
    // keeps it out of every monetary sum (`totalKnownPenalties`,
    // `contingentExposure`) — a percentage is not a SAR amount, and treating
    // its raw number as one would silently understate or overstate real
    // monetary exposure.
    const isPercentPenalty = isPercentCurrencyText(penalty.currency);
    return {
      ...baseCandidate("penalty_item", `penalties[${index}]`),
      targetKind: "penalty" as const,
      penaltyType: classifyPenaltyTypeText(penalty.description, penalty.condition),
      label: penalty.description,
      amountValue: isPercentPenalty ? null : sanitizeNumericAmount(penalty.amount),
      currency: isPercentPenalty ? null : normalizeCurrencyCode(penalty.currency),
      percentageValue: isPercentPenalty ? normalizePercentageValue(penalty.amount) : null,
      conditional: true,
      trigger: penalty.condition,
      evidence: penalty.description ?? penalty.condition,
    };
  });
}

/** Numbers whose `unit` confidently reads as a currency — everything else (percentages, durations, unrecognized units) is left out rather than guessed into a monetary role. */
function extractFromExtractedNumbers(input: ContractUnderstanding): Candidate[] {
  const candidates: Candidate[] = [];
  input.extractedNumbers.forEach((extracted, index) => {
    const currency = normalizeCurrencyCode(extracted.unit);
    if (currency === null) {
      return;
    }
    const amountValue = sanitizeNumericAmount(extracted.value);
    if (amountValue === null) {
      return;
    }
    const textFrequency = classifyFrequencyText(extracted.label);
    const obligationType = classifyObligationTypeText(textFrequency, extracted.label);
    const frequency = withOneTimeFrequencyFallback(textFrequency, obligationType);
    candidates.push({
      ...baseCandidate("extracted_number", `extractedNumbers[${index}]`),
      targetKind: "obligation",
      obligationType,
      label: extracted.label,
      amountValue,
      currency,
      frequency,
      evidence: extracted.label,
    });
  });
  return candidates;
}

function extractStatedTotalCostCandidates(input: ContractUnderstanding): Candidate[] {
  const candidates: Candidate[] = [];

  input.financialObligations.forEach((obligation, index) => {
    if (!isStatedTotalCostText(obligation.description)) {
      return;
    }
    const amountValue = sanitizeNumericAmount(obligation.amount);
    if (amountValue === null) {
      return;
    }
    candidates.push({
      ...baseCandidate("financial_obligation", `financialObligations[${index}]`),
      targetKind: "special",
      specialKey: "statedTotalCost",
      label: obligation.description,
      amountValue,
      currency: normalizeCurrencyCode(obligation.currency),
      evidence: obligation.description,
    });
  });

  input.extractedNumbers.forEach((extracted, index) => {
    if (!isStatedTotalCostText(extracted.label)) {
      return;
    }
    const currency = normalizeCurrencyCode(extracted.unit);
    const amountValue = sanitizeNumericAmount(extracted.value);
    if (amountValue === null) {
      return;
    }
    candidates.push({
      ...baseCandidate("extracted_number", `extractedNumbers[${index}]`),
      targetKind: "special",
      specialKey: "statedTotalCost",
      label: extracted.label,
      amountValue,
      currency,
      evidence: extracted.label,
    });
  });

  return candidates;
}

/**
 * Extracts contract-type-specific candidates from `typeDetails`. Each
 * contract type exposes a different, explicit set of numeric fields (see
 * `@workspace/contract-schema`'s discriminated union) — only fields that
 * represent an actual customer-owed cost, commitment, or a small set of
 * special headline values (principal, credit limit, deductible, income,
 * a stated interest rate/APR) are extracted; purely contextual fields
 * (property value, job title, etc.) are intentionally not consumed by any
 * Milestone 5.5 output field and are left out here.
 */
function extractFromTypeDetails(input: ContractUnderstanding): Candidate[] {
  const details = input.typeDetails;
  const candidates: Candidate[] = [];
  const push = (candidate: Candidate | null) => {
    if (candidate) {
      candidates.push(candidate);
    }
  };

  switch (details.contractType) {
    case "auto_finance": {
      push(fromTypeDetailsAmount("typeDetails.financedAmount", "Financed amount", details.financedAmount, {
        targetKind: "special",
        specialKey: "principal",
      }));
      push(fromTypeDetailsAmount("typeDetails.downPayment", "Down payment", details.downPayment, {
        obligationType: "upfront_payment",
        frequency: "one_time",
        mandatory: true,
      }));
      push(fromTypeDetailsAmount("typeDetails.monthlyInstallment", "Monthly installment", details.monthlyInstallment, {
        obligationType: "recurring_payment",
        frequency: "monthly",
        mandatory: true,
        numberOfPayments: details.loanTermMonths,
      }));
      push(fromTypeDetailsAmount("typeDetails.balloonPayment", "Balloon payment", details.balloonPayment, {
        obligationType: "balloon_payment",
        frequency: "one_time",
        mandatory: true,
      }));
      push(fromTypeDetailsPercentage("typeDetails.interestRate", "Interest rate (APR)", details.interestRate, {}));
      break;
    }
    case "personal_finance": {
      push(fromTypeDetailsAmount("typeDetails.loanAmount", "Loan amount", details.loanAmount, {
        targetKind: "special",
        specialKey: "principal",
      }));
      push(fromTypeDetailsAmount("typeDetails.monthlyInstallment", "Monthly installment", details.monthlyInstallment, {
        obligationType: "recurring_payment",
        frequency: "monthly",
        mandatory: true,
        numberOfPayments: details.loanTermMonths,
      }));
      push(fromTypeDetailsPercentage("typeDetails.interestRate", "Interest rate (APR)", details.interestRate, {}));
      break;
    }
    case "mortgage": {
      push(fromTypeDetailsAmount("typeDetails.loanAmount", "Loan amount", details.loanAmount, {
        targetKind: "special",
        specialKey: "principal",
      }));
      push(fromTypeDetailsAmount("typeDetails.downPayment", "Down payment", details.downPayment, {
        obligationType: "upfront_payment",
        frequency: "one_time",
        mandatory: true,
      }));
      push(fromTypeDetailsAmount("typeDetails.monthlyInstallment", "Monthly installment", details.monthlyInstallment, {
        obligationType: "recurring_payment",
        frequency: "monthly",
        mandatory: true,
      }));
      push(fromTypeDetailsPercentage("typeDetails.interestRate", "Interest rate (APR)", details.interestRate, {}));
      break;
    }
    case "credit_card": {
      push(fromTypeDetailsAmount("typeDetails.creditLimit", "Credit limit", details.creditLimit, {
        targetKind: "special",
        specialKey: "creditLimit",
      }));
      push(fromTypeDetailsAmount("typeDetails.annualFee", "Annual fee", details.annualFee, {
        targetKind: "fee",
        feeType: "other",
        frequency: "annual",
        mandatory: true,
      }));
      push(fromTypeDetailsAmount("typeDetails.lateFee", "Late payment fee", details.lateFee, {
        targetKind: "penalty",
        penaltyType: "late_payment",
        conditional: true,
      }));
      push(fromTypeDetailsAmount("typeDetails.cashAdvanceFee", "Cash advance fee", details.cashAdvanceFee, {
        targetKind: "fee",
        feeType: "other",
        mandatory: false,
        conditional: true,
      }));
      push(fromTypeDetailsPercentage("typeDetails.interestRateApr", "Interest rate (APR)", details.interestRateApr, {}));
      break;
    }
    case "lease": {
      push(fromTypeDetailsAmount("typeDetails.monthlyRent", "Monthly rent", details.monthlyRent, {
        obligationType: "recurring_payment",
        frequency: "monthly",
        mandatory: true,
        numberOfPayments: details.leaseTermMonths,
      }));
      push(fromTypeDetailsAmount("typeDetails.securityDeposit", "Security deposit", details.securityDeposit, {
        obligationType: "deposit",
        frequency: "one_time",
        mandatory: true,
        // Refundability is NOT assumed here — `securityDeposit` is a bare
        // number with no accompanying text in Milestone 4's schema, so
        // there is no explicit signal to read one way or the other.
        // `refundable` stays `null` (unknown/unresolved) via baseCandidate's
        // default; see calculators/costs.ts for how an unresolved deposit is
        // kept out of guaranteed cost without being silently assumed either
        // refundable or non-refundable.
      }));
      break;
    }
    case "insurance": {
      push(fromTypeDetailsAmount("typeDetails.premiumAmount", "Insurance premium", details.premiumAmount, {
        obligationType: "insurance",
        frequency: classifyFrequencyText(details.premiumFrequency),
        mandatory: true,
      }));
      push(fromTypeDetailsAmount("typeDetails.deductible", "Insurance deductible", details.deductible, {
        targetKind: "special",
        specialKey: "insuranceDeductible",
      }));
      push(fromTypeDetailsAmount("typeDetails.coverageAmount", "Coverage amount", details.coverageAmount, {
        targetKind: "special",
        specialKey: "coverageAmount",
      }));
      break;
    }
    case "employment": {
      push(fromTypeDetailsAmount("typeDetails.baseSalary", "Base salary", details.baseSalary, {
        targetKind: "special",
        specialKey: "monthlyIncome",
        frequency: classifyFrequencyText(details.salaryFrequency),
      }));
      break;
    }
    case "subscription": {
      push(fromTypeDetailsAmount("typeDetails.billingAmount", "Subscription billing amount", details.billingAmount, {
        obligationType: "recurring_payment",
        frequency: classifyFrequencyText(details.billingFrequency),
        mandatory: true,
      }));
      break;
    }
    case "other":
      break;
  }

  return candidates;
}

const SPECIAL_KEY_TO_ROLE: Record<SpecialValueKey, CandidateSemanticRole> = {
  principal: "principal",
  creditLimit: "credit_limit",
  outstandingBalance: "reference_value",
  monthlyIncome: "income",
  statedTotalCost: "reference_value",
  insuranceDeductible: "conditional_fee",
  coverageAmount: "coverage_limit",
  rate: "rate",
};

/**
 * Derives what a candidate actually *is* (see `CandidateSemanticRole`).
 * `specialKey`/fee/penalty candidates already carry a reliable structural
 * signal; a generic `targetKind: "obligation"` candidate (from
 * `financialObligations[]`/`extractedNumbers[]`/`typeDetails`) is the one
 * case that can describe a concept Milestone 4 has no dedicated field for
 * (an asset's value, a restated principal, a stated total cost, an
 * early-settlement scenario amount) — text is the only available signal for
 * those. This matters beyond just labeling: `extractStatedTotalCostCandidates`
 * (above) already extracts a "reference_value"-role `special` candidate for
 * a stated-total-cost line item from the *same* source array, so without
 * this check here, the very same line item would *also* survive as an
 * ordinary payment obligation and be double-counted on top of the itemized
 * figures it is summarizing.
 */
function deriveSemanticRole(candidate: Candidate): CandidateSemanticRole {
  if (candidate.specialKey) {
    return SPECIAL_KEY_TO_ROLE[candidate.specialKey];
  }

  if (candidate.targetKind === "fee") {
    return candidate.mandatory === true && candidate.conditional !== true ? "mandatory_fee" : "conditional_fee";
  }
  if (candidate.targetKind === "penalty") {
    return "penalty";
  }

  if (isAssetValueText(candidate.label, candidate.evidence)) {
    return "asset_value";
  }
  if (isStatedTotalCostText(candidate.label, candidate.evidence)) {
    return "reference_value";
  }
  const scenario = classifyScenarioContext(candidate.label, candidate.evidence, candidate.trigger);
  if (scenario !== null) {
    return isScenarioBalanceText(candidate.label, candidate.evidence) ? "scenario_balance" : "scenario_payment";
  }

  switch (candidate.obligationType) {
    case "principal":
      return "principal";
    case "upfront_payment":
    case "one_time_payment":
      return "upfront_payment";
    case "recurring_payment":
    case "balloon_payment":
    case "insurance":
      return "scheduled_payment";
    case "deposit":
      return "deposit";
    case "tax":
      return "mandatory_fee";
    case "conditional_payment":
      return "conditional_fee";
    default:
      return "unknown";
  }
}

/** A candidate's context follows scenario-keyword detection first, then falls back to `reference_only` for asset values / reference figures, else the normal contract path. */
function deriveContext(candidate: Candidate, semanticRole: CandidateSemanticRole): CandidateContext {
  const scenario = classifyScenarioContext(candidate.label, candidate.evidence, candidate.trigger);
  if (scenario !== null) {
    return scenario;
  }
  if (semanticRole === "asset_value" || semanticRole === "reference_value") {
    return "reference_only";
  }
  return "normal_contract_path";
}

function assignSemantics(candidate: Candidate): Candidate {
  const semanticRole = deriveSemanticRole(candidate);
  const context = deriveContext(candidate, semanticRole);
  return { ...candidate, semanticRole, context };
}

export interface ExtractedCandidates {
  candidates: Candidate[];
}

/**
 * Extracts every financial candidate from a validated `ContractUnderstanding`,
 * then assigns each one its internal semantic role/context (see
 * `assignSemantics`). Purely a data-gathering + classification step — no
 * deduplication and no conflict resolution happen here yet.
 */
export function extractCandidates(input: ContractUnderstanding): ExtractedCandidates {
  const candidates: Candidate[] = [
    ...extractFromTypeDetails(input),
    ...extractFromFinancialObligations(input),
    ...extractFromFees(input),
    ...extractFromPenalties(input),
    ...extractFromExtractedNumbers(input),
    ...extractStatedTotalCostCandidates(input),
  ].map(assignSemantics);

  return { candidates };
}
