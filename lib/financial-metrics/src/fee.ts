import { z } from "zod/v4";
import { idSchema, sourceFieldsSchema, uniqueIdArray } from "./common";
import { feeTypeSchema, metricStatusSchema, paymentFrequencySchema } from "./enums";
import { moneyMetricSchema } from "./moneyMetric";
import { percentageMetricSchema } from "./percentageMetric";

export const feeItemSchema = z.object({
  id: idSchema,
  type: feeTypeSchema,
  label: z.string(),
  amount: moneyMetricSchema,
  percentage: percentageMetricSchema,
  calculationBase: z.string().nullable(),
  frequency: paymentFrequencySchema.nullable(),
  mandatory: z.boolean().nullable(),
  conditional: z.boolean().nullable(),
  refundable: z.boolean().nullable(),
  sourceFields: sourceFieldsSchema,
});

export type FeeItem = z.infer<typeof feeItemSchema>;

export const feeCollectionSchema = z.object({
  items: uniqueIdArray(feeItemSchema),
  totalKnownFees: moneyMetricSchema,
  mandatoryFees: moneyMetricSchema,
  upfrontFees: moneyMetricSchema,
  recurringFees: moneyMetricSchema,
  conditionalFees: moneyMetricSchema,
  hasUndefinedFees: z.boolean().nullable(),
  status: metricStatusSchema,
});

export type FeeCollection = z.infer<typeof feeCollectionSchema>;
