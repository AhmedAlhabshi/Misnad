import { z } from "zod/v4";
import { checkUnavailableRequiresNullValueAndReason, currencyCodeSchema } from "./common";
import { confidenceSchema, metricStatusSchema } from "./enums";

/**
 * A single monetary data point tracked through its extraction/calculation
 * lifecycle: whether it is known, estimated, or unavailable; where it came
 * from; and how confident the source is. This is the base money primitive
 * reused throughout the package instead of a bare nullable number, so every
 * money-shaped field gets the same status/integrity guarantees uniformly.
 */
export const moneyMetricSchema = z
  .object({
    value: z.number().nonnegative().nullable(),
    currency: currencyCodeSchema.nullable(),
    status: metricStatusSchema,
    source: z.string().nullable(),
    reason: z.string().nullable(),
    confidence: confidenceSchema,
  })
  .superRefine((data, ctx) => {
    checkUnavailableRequiresNullValueAndReason(data, ctx);

    if (data.value !== null && data.currency === null) {
      ctx.addIssue({
        code: "custom",
        path: ["currency"],
        message: "currency is required whenever value is a number",
      });
    }
  });

export type MoneyMetric = z.infer<typeof moneyMetricSchema>;
