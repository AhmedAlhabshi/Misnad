import { z } from "zod/v4";
import { idSchema, sourceFieldsSchema } from "./common";
import { obligationTypeSchema, paymentFrequencySchema } from "./enums";
import { moneyMetricSchema } from "./moneyMetric";

export const paymentObligationSchema = z.object({
  id: idSchema,
  label: z.string(),
  type: obligationTypeSchema,
  amount: moneyMetricSchema,
  frequency: paymentFrequencySchema,
  numberOfPayments: z.number().int().nonnegative().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  mandatory: z.boolean().nullable(),
  conditional: z.boolean().nullable(),
  sourceFields: sourceFieldsSchema,
});

export type PaymentObligation = z.infer<typeof paymentObligationSchema>;
