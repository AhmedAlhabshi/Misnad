import { z } from "zod/v4";
import { percentageMetricSchema } from "./percentageMetric";

export const financialRatiosSchema = z.object({
  feesToBaseCost: percentageMetricSchema,
  penaltiesToBaseCost: percentageMetricSchema,
  upfrontPaymentToBaseCost: percentageMetricSchema,
  balloonPaymentToBaseCost: percentageMetricSchema,
  totalCostIncrease: percentageMetricSchema,
  recurringPaymentToIncome: percentageMetricSchema,
});

export type FinancialRatios = z.infer<typeof financialRatiosSchema>;
