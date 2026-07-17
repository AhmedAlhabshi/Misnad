import type { FeeItem } from "../fee";
import type { PaymentObligation } from "../paymentObligation";
import { isDepositLikeText } from "./classify";
import type { CandidateContext, CandidateSemanticRole } from "./semantics";

/** A mandatory/conditional gate: decides whether an obligation or fee counts toward a given total. */
export type EligibilityGate = (mandatory: boolean | null, conditional: boolean | null) => boolean;

/**
 * A one-time obligation or fee is part of the guaranteed, normal-path cost
 * only when it is mandatory and not conditional. Shared by `costs.ts` and
 * `exposure.ts` so "is this guaranteed" is defined in exactly one place.
 */
export const isGuaranteed: EligibilityGate = (mandatory, conditional) => mandatory === true && conditional !== true;

/**
 * A looser "is this genuinely known financial exposure of the normal
 * contract path" gate — used for `exposure.totalsByCurrency`, which is not
 * the same concept as guaranteed core cost. Many fees are conservatively
 * left with `mandatory: null` when the source text states no explicit
 * mandatory/optional wording (see `extractFromFees`) — such a fee is still
 * a real, known amount tied to the contract and must not be silently
 * dropped from known exposure merely because the text never used the word
 * "mandatory". Only an explicit optional (`mandatory === false`) or
 * conditional (`conditional === true`) signal excludes it here.
 */
export const isNormalPathExposureComponent: EligibilityGate = (mandatory, conditional) =>
  conditional !== true && mandatory !== false;

type RefundabilityResolution = "include" | "exclude" | "exclude_unresolved";

/**
 * A deposit's refundability is a genuinely open question (unlike an ordinary
 * fee/obligation, which is treated as a real cost even when refundability is
 * unstated): explicitly refundable is excluded (not a real cost), explicitly
 * non-refundable is included, and unresolved refundability is excluded too —
 * but callers must record that exclusion, since it must never be silently
 * assumed either way.
 */
function resolveRefundability(isDepositLike: boolean, refundable: boolean | null): RefundabilityResolution {
  if (isDepositLike) {
    if (refundable === true) return "exclude";
    if (refundable === null) return "exclude_unresolved";
    return "include";
  }
  return refundable === true ? "exclude" : "include";
}

export interface EligibleSelection<T> {
  eligible: T[];
  unresolvedDeposits: T[];
}

/**
 * One-time obligations eligible for core cost/exposure under the given gate
 * (defaults to the strict `isGuaranteed` gate) — excludes conditional/optional
 * amounts and unresolved-refundability deposits (never assumed either way).
 * Non-deposit one-time obligations (down payments, balloon payments) are
 * unaffected by refundability. Pass `requireOneTime: false` to select
 * eligible obligations of any frequency (used for the recurring-obligation
 * currency fallback in `exposure.ts`).
 */
export function selectEligibleOneTimeObligations(
  obligations: readonly PaymentObligation[],
  obligationRefundability: ReadonlyMap<string, boolean | null>,
  gate: EligibilityGate = isGuaranteed,
  requireOneTime = true,
): EligibleSelection<PaymentObligation> {
  const eligible: PaymentObligation[] = [];
  const unresolvedDeposits: PaymentObligation[] = [];
  for (const obligation of obligations) {
    if (!gate(obligation.mandatory, obligation.conditional) || (requireOneTime && obligation.frequency !== "one_time")) {
      continue;
    }
    if (obligation.type === "deposit") {
      const refundable = obligationRefundability.get(obligation.id) ?? null;
      const resolution = resolveRefundability(true, refundable);
      if (resolution === "exclude") continue;
      if (resolution === "exclude_unresolved") {
        unresolvedDeposits.push(obligation);
        continue;
      }
    }
    eligible.push(obligation);
  }
  return { eligible, unresolvedDeposits };
}

/**
 * Fees eligible for core cost/exposure under the given gate (defaults to the
 * strict `isGuaranteed` gate) — same deposit-refundability tri-state handling
 * as obligations, using text-based deposit detection since `FeeType` has no
 * dedicated deposit variant.
 */
export function selectEligibleMandatoryFeeItems(
  items: readonly FeeItem[],
  gate: EligibilityGate = isGuaranteed,
): EligibleSelection<FeeItem> {
  const eligible: FeeItem[] = [];
  const unresolvedDeposits: FeeItem[] = [];
  for (const item of items) {
    if (!gate(item.mandatory, item.conditional)) {
      continue;
    }
    const resolution = resolveRefundability(isDepositLikeText(item.label), item.refundable);
    if (resolution === "exclude") continue;
    if (resolution === "exclude_unresolved") {
      unresolvedDeposits.push(item);
      continue;
    }
    eligible.push(item);
  }
  return { eligible, unresolvedDeposits };
}

const ROLES_NOT_ELIGIBLE_AS_PAYMENT_OBLIGATIONS: ReadonlySet<CandidateSemanticRole> = new Set([
  "asset_value",
  "principal",
  "reference_value",
  "scenario_balance",
  "scenario_payment",
  "credit_limit",
  "coverage_limit",
  "income",
  "conditional_income",
  "non_cash_benefit",
]);

const CONTEXTS_NOT_ELIGIBLE_AS_PAYMENT_OBLIGATIONS: ReadonlySet<CandidateContext> = new Set([
  "early_settlement_scenario",
  "default_scenario",
  "cancellation_scenario",
  "insurance_claim_scenario",
  "reference_only",
]);

/**
 * Centralized "can this candidate ever become a `PaymentObligation`" check —
 * used by `finalize.ts` so this decision is never duplicated across
 * calculators. Deliberately a negative exclusion list (not a positive
 * allow-list): an unclassified (`"unknown"`-role) obligation must still be
 * eligible, since many legitimate obligations are never given a more
 * specific role.
 */
export function isEligiblePaymentObligation(semanticRole: CandidateSemanticRole, context: CandidateContext): boolean {
  return (
    !ROLES_NOT_ELIGIBLE_AS_PAYMENT_OBLIGATIONS.has(semanticRole) &&
    !CONTEXTS_NOT_ELIGIBLE_AS_PAYMENT_OBLIGATIONS.has(context)
  );
}
