import type { ContractType } from "@workspace/contract-types";
import {
  isCompensationComponentText,
  isConditionalCompensationText,
  isEmployeeEntitlementText,
  isNonCashBenefitText,
  isStatedTotalCompensationText,
} from "./classify";
import type { Candidate } from "./candidates";

const AMOUNT_CONSISTENCY_EPSILON = 0.01;

/**
 * Employment-only classification pass, run once at the end of
 * `extractCandidates` (mirrors the lease package's own
 * `applyRecurringEquivalenceReclassification`). An employment contract's
 * money is fundamentally different in direction from every other contract
 * type this engine handles: it mostly INCREASES the user's income rather
 * than being a cost, and its conditional amounts can flow either way
 * (a bonus/termination compensation TO the employee, or a deduction FROM
 * the employee) — neither of which the generic candidate/eligibility
 * machinery assumes by default. Scoped strictly to
 * `contractType === "employment"` so no other contract type's
 * classification is ever touched.
 *
 * Four independent reclassifications happen here, each gated on its own
 * explicit text signal (never inferred from amount/frequency alone):
 *
 * 1. Every guaranteed, fixed salary component (base salary, a housing/
 *    transportation allowance, ...) is marked `salaryComponent` — visible
 *    individually (`informationalAmounts[]`, type `salary_component`) but
 *    never itself the canonical guaranteed income figure.
 * 2. A stated "total fixed monthly compensation" fact is marked
 *    `statedTotalCompensation` and preferred as the canonical guaranteed
 *    income when it is arithmetically consistent with the sum of the
 *    guaranteed components found in (1) — otherwise the component sum
 *    itself is used. Exactly one canonical `monthlyIncome`-keyed candidate
 *    is then synthesized so the existing `resolveMonthlyIncome` (engine.ts)
 *    machinery consumes it unchanged.
 * 3. A non-guaranteed, performance-dependent cash amount (a bonus,
 *    commission, uncertain overtime pay) is reclassified `conditional_income`
 *    — flows to the user, but is never counted as guaranteed income.
 * 4. A non-cash/qualitative benefit (medical insurance, paid leave, an
 *    overtime entitlement) is reclassified `non_cash_benefit`.
 * 5. A conditional penalty-shaped amount worded as an employer-paid
 *    entitlement TO the employee (e.g. termination-without-cause
 *    compensation) is reclassified `conditional_income` instead of the
 *    default `penalty`/`conditional_cost` every other contract type's
 *    penalties assume — so it is never presented as a cost the user owes.
 */
export function applyEmploymentClassification(candidates: readonly Candidate[], contractType: ContractType): Candidate[] {
  if (contractType !== "employment") {
    return [...candidates];
  }

  let working: Candidate[] = candidates.map((candidate) => {
    // (1) Base salary was extracted as `salaryComponent` directly by
    // `extractFromTypeDetails` already — nothing to do here for it.
    if (candidate.targetKind !== "obligation" && candidate.targetKind !== "fee" && candidate.targetKind !== "penalty") {
      return candidate;
    }

    if (candidate.targetKind === "penalty") {
      // (5) Entitlement-direction conditional amounts (money TO the
      // employee) are reclassified away from the default cost direction.
      if (isEmployeeEntitlementText(candidate.label, candidate.evidence, candidate.trigger)) {
        return { ...candidate, semanticRole: "conditional_income" as const };
      }
      return candidate;
    }

    // (4) Non-cash/qualitative benefits — checked before the guaranteed-
    // component and conditional-income checks below, since a benefit is
    // never a cash amount to sum either way.
    if (isNonCashBenefitText(candidate.label, candidate.evidence)) {
      // `mandatory`/`conditional` still gate the generic, financialRole-
      // agnostic `fees.mandatoryFees`/`calculatedCoreObligations` totals
      // (see `pipeline/eligibility.ts`'s `isGuaranteed`) — a benefit is
      // never something the *employee* owes, guaranteed or not, so it must
      // never satisfy that gate regardless of its own wording.
      return { ...candidate, semanticRole: "non_cash_benefit" as const, mandatory: false };
    }

    // (3) Non-guaranteed, performance-dependent compensation.
    if (isConditionalCompensationText(candidate.label, candidate.evidence)) {
      return { ...candidate, semanticRole: "conditional_income" as const, conditional: true, mandatory: false };
    }

    // (2) A stated total fixed compensation fact.
    if (isStatedTotalCompensationText(candidate.label, candidate.evidence)) {
      return {
        ...candidate,
        targetKind: "special" as const,
        specialKey: "statedTotalCompensation" as const,
        semanticRole: "reference_value" as const,
        context: "reference_only" as const,
      };
    }

    // (1) A guaranteed, fixed salary component (housing/transportation
    // allowance, or another named fixed allowance) reported generically.
    if (isCompensationComponentText(candidate.label, candidate.evidence)) {
      return {
        ...candidate,
        targetKind: "special" as const,
        specialKey: "salaryComponent" as const,
        semanticRole: "reference_value" as const,
        context: "reference_only" as const,
      };
    }

    return candidate;
  });

  const canonicalIncome = deriveCanonicalGuaranteedIncome(working);
  if (canonicalIncome) {
    working = [...working, canonicalIncome];
  }

  return working;
}

/**
 * Derives the single canonical guaranteed-monthly-employment-income
 * candidate: prefers a stated total fixed compensation fact when it is
 * arithmetically consistent with the sum of the guaranteed salary
 * components found; otherwise falls back to that component sum; otherwise
 * falls back to the stated total alone (components entirely unstated);
 * returns `null` when neither is known (nothing to synthesize).
 */
function deriveCanonicalGuaranteedIncome(candidates: readonly Candidate[]): Candidate | null {
  const components = candidates.filter((c) => c.specialKey === "salaryComponent" && c.amountValue !== null);
  const statedTotal = candidates.find((c) => c.specialKey === "statedTotalCompensation" && c.amountValue !== null);

  const componentSum = components.reduce((sum, c) => sum + (c.amountValue ?? 0), 0);
  const componentCurrency = components.find((c) => c.currency !== null)?.currency ?? null;

  let amountValue: number;
  let currency: string | null;
  let evidence: string;

  if (
    statedTotal &&
    statedTotal.amountValue !== null &&
    components.length > 0 &&
    Math.abs(statedTotal.amountValue - componentSum) <= AMOUNT_CONSISTENCY_EPSILON
  ) {
    amountValue = statedTotal.amountValue;
    currency = statedTotal.currency ?? componentCurrency;
    evidence = statedTotal.label;
  } else if (components.length > 0) {
    amountValue = componentSum;
    currency = componentCurrency;
    evidence = "sum of guaranteed salary components";
  } else if (statedTotal && statedTotal.amountValue !== null) {
    amountValue = statedTotal.amountValue;
    currency = statedTotal.currency;
    evidence = statedTotal.label;
  } else {
    return null;
  }

  return {
    targetKind: "special",
    specialKey: "monthlyIncome",
    semanticRole: "income",
    context: "normal_contract_path",
    label: "Guaranteed monthly employment income",
    amountValue,
    currency,
    percentageValue: null,
    frequency: "monthly",
    numberOfPayments: null,
    startDate: null,
    endDate: null,
    mandatory: true,
    conditional: false,
    refundable: null,
    paymentTiming: null,
    calculationBase: null,
    trigger: null,
    sourceKind: "type_details",
    sourceField: "employment.guaranteedMonthlyIncome",
    evidence,
    confidence: "high",
  };
}
