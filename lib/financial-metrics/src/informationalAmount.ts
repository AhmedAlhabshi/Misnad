import { z } from "zod/v4";
import { idSchema, sourceFieldsSchema } from "./common";
import { financialRoleSchema } from "./enums";
import { moneyMetricSchema } from "./moneyMetric";
import { percentageMetricSchema } from "./percentageMetric";

/**
 * What kind of informational/reference financial fact this is — mirrors the
 * internal `SpecialValueKey` used during extraction (see
 * `pipeline/candidates.ts`), exposed publicly under stable, self-describing
 * names. Every value here is a stated contract fact that is NOT itself a
 * payment obligation the user owes (a financing principal, a credit/coverage
 * limit, an income figure, a conditional deductible, an outstanding balance,
 * a stated grand total, or a stated rate/APR) — see `FinancialRole` for how
 * each is further classified for presentation.
 */
export const INFORMATIONAL_AMOUNT_TYPE_VALUES = [
  "principal",
  "credit_limit",
  "outstanding_balance",
  "monthly_income",
  "stated_total_cost",
  "insurance_deductible",
  "coverage_amount",
  "rate",
  /**
   * A stated reference/collateral value (e.g. a vehicle's cash price, a
   * property's value, an insured asset's value) — generic across contract
   * types, never itself a payment the customer owes. Unlike the other
   * values above, this one is not routed through a dedicated `SpecialValueKey`
   * from `typeDetails` — it arises from generic free-text classification
   * (see `pipeline/classify.ts`'s `isAssetValueText`) since no contract
   * type's schema has a dedicated "asset value" field.
   */
  "asset_value",
] as const;
export const informationalAmountTypeSchema = z.enum(INFORMATIONAL_AMOUNT_TYPE_VALUES);
export type InformationalAmountType = z.infer<typeof informationalAmountTypeSchema>;

/**
 * A single informational/reference financial fact explicitly stated in the
 * contract — extracted, classified, and deduplicated exactly like a
 * `PaymentObligation`/`FeeItem`, but never eligible to become one (see
 * `pipeline/eligibility.ts`'s `ROLES_NOT_ELIGIBLE_AS_PAYMENT_OBLIGATIONS`).
 * Previously these `specialKey`-routed candidates were extracted internally
 * but never exposed publicly — this collection is the fix: it makes facts
 * like a financing principal or a stated APR individually inspectable by
 * presentation layers instead of only feeding internal aggregate
 * calculations (`totalCost.calculatedBaseCost`, etc., which remain
 * unchanged and continue to read from the same underlying candidates).
 * Either `amount` or `percentage` is meaningfully populated depending on
 * `type` (a rate/APR uses `percentage`; everything else uses `amount`) —
 * mirrors the same two-metric pattern already used by `FeeItem`/`PenaltyItem`.
 */
export const informationalAmountSchema = z.object({
  id: idSchema,
  type: informationalAmountTypeSchema,
  label: z.string(),
  amount: moneyMetricSchema,
  percentage: percentageMetricSchema,
  financialRole: financialRoleSchema,
  sourceFields: sourceFieldsSchema,
});

export type InformationalAmount = z.infer<typeof informationalAmountSchema>;
