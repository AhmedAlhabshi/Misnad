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
  | "deposit"
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
