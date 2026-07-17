import type { FinancialRole, PaymentFrequency } from "../enums";
import type { PaymentTiming } from "./classify";

/**
 * Internal semantic role a candidate plays in the contract — deliberately
 * finer-grained than the public `ObligationType`/`FeeType`/`PenaltyType`
 * enums, since those alone cannot distinguish "this number is a real
 * payment obligation" from "this number is a reference figure, a
 * principal/base amount, or an early-settlement-scenario amount that must
 * never enter normal-path cost." Not exposed publicly.
 */
export type CandidateSemanticRole =
  | "asset_value"
  | "principal"
  | "scheduled_payment"
  | "upfront_payment"
  | "mandatory_fee"
  | "conditional_fee"
  | "penalty"
  | "scenario_balance"
  | "scenario_payment"
  | "reference_value"
  | "income"
  | "credit_limit"
  | "coverage_limit"
  | "deposit"
  | "rate"
  /** Non-guaranteed, performance-dependent employment compensation (a bonus, commission, uncertain overtime pay) — flows to the user, never a cost, never counted as guaranteed income. */
  | "conditional_income"
  /** A non-cash or qualitative employment benefit (medical insurance, paid leave, an overtime entitlement) — never a monthly cost or a cash amount to sum. */
  | "non_cash_benefit"
  | "unknown";

/**
 * Which "path" through the contract a candidate belongs to. Only
 * `normal_contract_path` amounts ever contribute to guaranteed/known cost,
 * exposure totals, or `maximumSinglePayment` — everything else (an
 * early-settlement scenario, a default scenario, ...) is excluded from
 * those, though it may still be preserved via `calculationMetadata`.
 */
export type CandidateContext =
  | "normal_contract_path"
  | "early_settlement_scenario"
  | "default_scenario"
  | "cancellation_scenario"
  | "insurance_claim_scenario"
  | "reference_only";

const RECURRING_FREQUENCIES = new Set<PaymentFrequency>(["daily", "weekly", "monthly", "quarterly", "semi_annual", "annual"]);

/**
 * Maps the internal, finer-grained `CandidateSemanticRole` to the public
 * `FinancialRole` the presentation layer uses to decide what a value
 * actually represents (an outflow, income, a limit, a refundable amount,
 * an informational total, ...) — never treating every number as generic
 * "cost". This is the single translation point between the engine's
 * internal classification and the public schema; every `PaymentObligation`/
 * `FeeItem`/`PenaltyItem` gets its `financialRole` from here.
 */
export function toFinancialRole(
  semanticRole: CandidateSemanticRole,
  frequency: PaymentFrequency | null,
  refundable: boolean | null,
  paymentTiming: PaymentTiming | null = null,
): FinancialRole {
  switch (semanticRole) {
    case "asset_value":
      return "asset_value";
    case "principal":
      return "financing_principal";
    case "upfront_payment":
      return "upfront_liquidity";
    case "scheduled_payment":
    case "mandatory_fee": {
      if (frequency !== null && RECURRING_FREQUENCIES.has(frequency)) {
        return "recurring_outflow";
      }
      // A one-time mandatory fee/payment only counts as upfront liquidity
      // when the contract text explicitly confirms it is due now (at
      // signing/contract start) — never inferred just because it happens to
      // be one-time. A final/balloon payment (due later) or a one-time
      // amount with genuinely unstated timing both stay `one_time_outflow`,
      // which the presentation layer never treats as an upfront cost.
      return paymentTiming === "due_now" ? "upfront_liquidity" : "one_time_outflow";
    }
    case "conditional_fee":
    case "penalty":
      return "conditional_cost";
    case "scenario_balance":
    case "scenario_payment":
    case "reference_value":
      return "informational_total";
    case "income":
      return "income";
    case "credit_limit":
      return "credit_limit";
    case "coverage_limit":
      return "coverage_limit";
    case "deposit":
      return refundable === true ? "refundable" : "upfront_liquidity";
    case "rate":
      return "rate_or_percentage";
    case "conditional_income":
      return "conditional_income";
    case "non_cash_benefit":
      return "benefit";
    case "unknown":
    default:
      return "other";
  }
}
