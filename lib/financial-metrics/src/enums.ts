import { z } from "zod/v4";

export const METRIC_STATUS_VALUES = ["known", "estimated", "unavailable"] as const;
export const metricStatusSchema = z.enum(METRIC_STATUS_VALUES);
export type MetricStatus = z.infer<typeof metricStatusSchema>;

export const CONFIDENCE_VALUES = ["low", "medium", "high"] as const;
export const confidenceSchema = z.enum(CONFIDENCE_VALUES);
export type Confidence = z.infer<typeof confidenceSchema>;

export const OBLIGATION_TYPE_VALUES = [
  "principal",
  "recurring_payment",
  "one_time_payment",
  "upfront_payment",
  "deposit",
  "insurance",
  "tax",
  "balloon_payment",
  "conditional_payment",
  "unknown",
] as const;
export const obligationTypeSchema = z.enum(OBLIGATION_TYPE_VALUES);
export type ObligationType = z.infer<typeof obligationTypeSchema>;

export const PAYMENT_FREQUENCY_VALUES = [
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "semi_annual",
  "annual",
  "irregular",
  "unknown",
] as const;
export const paymentFrequencySchema = z.enum(PAYMENT_FREQUENCY_VALUES);
export type PaymentFrequency = z.infer<typeof paymentFrequencySchema>;

export const DURATION_UNIT_VALUES = ["days", "weeks", "months", "years", "unknown"] as const;
export const durationUnitSchema = z.enum(DURATION_UNIT_VALUES);
export type DurationUnit = z.infer<typeof durationUnitSchema>;

export const FEE_TYPE_VALUES = [
  "administration",
  "processing",
  "subscription",
  "insurance",
  "maintenance",
  "transfer",
  "registration",
  "service",
  "renewal",
  "tax",
  "other",
] as const;
export const feeTypeSchema = z.enum(FEE_TYPE_VALUES);
export type FeeType = z.infer<typeof feeTypeSchema>;

export const PENALTY_TYPE_VALUES = [
  "late_payment",
  "early_termination",
  "early_settlement",
  "default",
  "cancellation",
  "returned_payment",
  "other",
] as const;
export const penaltyTypeSchema = z.enum(PENALTY_TYPE_VALUES);
export type PenaltyType = z.infer<typeof penaltyTypeSchema>;

/**
 * The semantic role a financial value plays — not every number is a
 * "cost". Drives which items are guaranteed outflows vs. conditional costs
 * vs. purely informational (income, a credit/coverage limit, an asset
 * value, a financing principal, ...), so the presentation layer never
 * treats all money as generic expense.
 */
export const FINANCIAL_ROLE_VALUES = [
  "income",
  "recurring_outflow",
  "one_time_outflow",
  "upfront_liquidity",
  "refundable",
  "conditional_cost",
  "financing_principal",
  "asset_value",
  "credit_limit",
  "coverage_limit",
  "benefit",
  "refund",
  "rate_or_percentage",
  "informational_total",
  "deduction",
  "other",
] as const;
export const financialRoleSchema = z.enum(FINANCIAL_ROLE_VALUES);
export type FinancialRole = z.infer<typeof financialRoleSchema>;

export const COST_DIFFERENCE_CLASSIFICATION_VALUES = [
  "match",
  "rounding",
  "warning",
  "conflict",
  "unavailable",
] as const;
export const costDifferenceClassificationSchema = z.enum(COST_DIFFERENCE_CLASSIFICATION_VALUES);
export type CostDifferenceClassification = z.infer<typeof costDifferenceClassificationSchema>;

/**
 * No severity scale is specified for calculation warnings in the spec this
 * package implements. Reuses the repository's existing "low"/"medium"/"high"
 * convention (see @workspace/contract-schema's `importantClauseSchema.riskLevel`)
 * instead of inventing a new one.
 */
export const CALCULATION_WARNING_SEVERITY_VALUES = ["low", "medium", "high"] as const;
export const calculationWarningSeveritySchema = z.enum(CALCULATION_WARNING_SEVERITY_VALUES);
export type CalculationWarningSeverity = z.infer<typeof calculationWarningSeveritySchema>;
