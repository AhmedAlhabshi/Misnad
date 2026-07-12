import { z } from "zod/v4";
import { idSchema, sourceFieldsSchema } from "./common";

export const positiveFinancialFactorSchema = z.object({
  id: idSchema,
  titleKey: z.string().min(1),
  reason: z.string().nullable(),
  sourceFields: sourceFieldsSchema,
});

export type PositiveFinancialFactor = z.infer<typeof positiveFinancialFactorSchema>;
