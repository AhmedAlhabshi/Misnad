import { z } from "zod/v4";
import { costDifferenceClassificationSchema } from "./enums";
import { moneyMetricSchema } from "./moneyMetric";

export const costDifferenceSchema = z.object({
  classification: costDifferenceClassificationSchema,
  amount: moneyMetricSchema,
  reason: z.string().nullable(),
});

export type CostDifference = z.infer<typeof costDifferenceSchema>;

export const totalCostSchema = z.object({
  statedTotalCost: moneyMetricSchema,
  calculatedBaseCost: moneyMetricSchema,
  calculatedCoreObligations: moneyMetricSchema,
  calculatedKnownCost: moneyMetricSchema,
  estimatedContractCost: moneyMetricSchema,
  differenceFromStated: costDifferenceSchema,
});

export type TotalCost = z.infer<typeof totalCostSchema>;
