import type { ContractUnderstanding } from "@workspace/contract-schema";
import type { Confidence, FeeType, ObligationType, PaymentFrequency, PenaltyType } from "../enums";
import { normalizeCurrencyCode, sanitizeNumericAmount } from "../normalize/money";
import { classifyFrequencyText } from "../normalize/text";
import {
  classifyFeeTypeText,
  classifyObligationTypeText,
  classifyPenaltyTypeText,
  inferConditionalFromText,
  inferMandatoryFromText,
  inferRefundableFromText,
  isStatedTotalCostText,
} from "./classify";

export type CandidateTargetKind = "obligation" | "fee" | "penalty" | "special";

export type SpecialValueKey =
  | "principal"
  | "creditLimit"
  | "outstandingBalance"
  | "monthlyIncome"
  | "statedTotalCost"
  | "insuranceDeductible";

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
    percentageValue: null,
    frequency: null,
    numberOfPayments: null,
    startDate: null,
    endDate: null,
    mandatory: null,
    conditional: null,
    refundable: null,
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

function extractFromFinancialObligations(input: ContractUnderstanding): Candidate[] {
  return input.financialObligations.map((obligation, index) => {
    const amountValue = sanitizeNumericAmount(obligation.amount);
    const frequency = classifyFrequencyText(obligation.frequency);
    const obligationType = classifyObligationTypeText(frequency, obligation.description);
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
      evidence: fee.description,
    };
  });
}

function extractFromPenalties(input: ContractUnderstanding): Candidate[] {
  return input.penalties.map((penalty, index) => ({
    ...baseCandidate("penalty_item", `penalties[${index}]`),
    targetKind: "penalty" as const,
    penaltyType: classifyPenaltyTypeText(penalty.description, penalty.condition),
    label: penalty.description,
    amountValue: sanitizeNumericAmount(penalty.amount),
    currency: normalizeCurrencyCode(penalty.currency),
    conditional: true,
    trigger: penalty.condition,
    evidence: penalty.description ?? penalty.condition,
  }));
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
    const frequency = classifyFrequencyText(extracted.label);
    candidates.push({
      ...baseCandidate("extracted_number", `extractedNumbers[${index}]`),
      targetKind: "obligation",
      obligationType: classifyObligationTypeText(frequency, extracted.label),
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
 * special headline values (principal, credit limit, deductible, income)
 * are extracted; purely contextual fields (interest rate, property value,
 * coverage amount, job title, etc.) are intentionally not consumed by any
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
      }));
      push(fromTypeDetailsAmount("typeDetails.balloonPayment", "Balloon payment", details.balloonPayment, {
        obligationType: "balloon_payment",
        frequency: "one_time",
        mandatory: true,
      }));
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
      }));
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
      break;
    }
    case "lease": {
      push(fromTypeDetailsAmount("typeDetails.monthlyRent", "Monthly rent", details.monthlyRent, {
        obligationType: "recurring_payment",
        frequency: "monthly",
        mandatory: true,
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

export interface ExtractedCandidates {
  candidates: Candidate[];
}

/**
 * Extracts every financial candidate from a validated `ContractUnderstanding`.
 * Purely a data-gathering step — no classification refinement beyond what's
 * needed to bucket a candidate (`targetKind`), no deduplication, and no
 * conflict resolution happen here yet.
 */
export function extractCandidates(input: ContractUnderstanding): ExtractedCandidates {
  const candidates: Candidate[] = [
    ...extractFromTypeDetails(input),
    ...extractFromFinancialObligations(input),
    ...extractFromFees(input),
    ...extractFromPenalties(input),
    ...extractFromExtractedNumbers(input),
    ...extractStatedTotalCostCandidates(input),
  ];

  return { candidates };
}
