import { z } from "zod/v4";
import { idSchema, sourceFieldsSchema, uniqueIdArray } from "./common";
import { financialRoleSchema, metricStatusSchema, penaltyTypeSchema } from "./enums";
import { moneyMetricSchema } from "./moneyMetric";
import { percentageMetricSchema } from "./percentageMetric";

export const penaltyItemSchema = z.object({
  id: idSchema,
  type: penaltyTypeSchema,
  label: z.string(),
  amount: moneyMetricSchema,
  percentage: percentageMetricSchema,
  calculationBase: z.string().nullable(),
  trigger: z.string().nullable(),
  maximumAmount: moneyMetricSchema,
  conditional: z.boolean().nullable(),
  /** Always `conditional_cost` — penalties are conditional by construction. Included for a uniform `financialRole` across all three item types. */
  financialRole: financialRoleSchema,
  sourceFields: sourceFieldsSchema,
});

export type PenaltyItem = z.infer<typeof penaltyItemSchema>;

export const penaltyCollectionSchema = z.object({
  items: uniqueIdArray(penaltyItemSchema),
  totalKnownPenalties: moneyMetricSchema,
  highestKnownPenalty: moneyMetricSchema,
  hasUndefinedPenalty: z.boolean().nullable(),
  status: metricStatusSchema,
});

export type PenaltyCollection = z.infer<typeof penaltyCollectionSchema>;
