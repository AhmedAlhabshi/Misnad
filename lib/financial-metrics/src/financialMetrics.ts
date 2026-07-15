import { z } from "zod/v4";
import { currencyCodeSchema, uniqueIdArray } from "./common";
import { calculationMetadataSchema } from "./calculationMetadata";
import { contractDurationSchema } from "./contractDuration";
import { exposureSchema } from "./exposure";
import { feeCollectionSchema } from "./fee";
import { informationalAmountSchema } from "./informationalAmount";
import { paymentObligationSchema } from "./paymentObligation";
import { penaltyCollectionSchema } from "./penalty";
import { positiveFinancialFactorSchema } from "./positiveFinancialFactor";
import { financialRatiosSchema } from "./ratios";
import { recurringCommitmentSchema } from "./recurringCommitment";
import { totalCostSchema } from "./totalCost";

/** Bumped whenever the root schema's shape changes, so consumers can migrate stored data by version. */
export const FINANCIAL_METRICS_SCHEMA_VERSION = "1.0" as const;
export const financialMetricsSchemaVersionSchema = z.literal(FINANCIAL_METRICS_SCHEMA_VERSION);

export const financialMetricsSchema = z.object({
  schemaVersion: financialMetricsSchemaVersionSchema.default(FINANCIAL_METRICS_SCHEMA_VERSION),
  currency: currencyCodeSchema.nullable(),
  paymentObligations: uniqueIdArray(paymentObligationSchema),
  /**
   * Stated informational/reference financial facts (financing principal,
   * credit/coverage limit, income, a deductible, an outstanding balance, a
   * stated grand total, or a stated rate/APR) — see `InformationalAmount`.
   * Never payment obligations; kept separate so a principal can never be
   * mistaken for an additional amount the user pays.
   */
  informationalAmounts: uniqueIdArray(informationalAmountSchema),
  recurringCommitment: recurringCommitmentSchema,
  contractDuration: contractDurationSchema,
  totalCost: totalCostSchema,
  fees: feeCollectionSchema,
  penalties: penaltyCollectionSchema,
  ratios: financialRatiosSchema,
  exposure: exposureSchema,
  positiveFinancialFactors: uniqueIdArray(positiveFinancialFactorSchema),
  calculationMetadata: calculationMetadataSchema,
});

export type FinancialMetrics = z.infer<typeof financialMetricsSchema>;
