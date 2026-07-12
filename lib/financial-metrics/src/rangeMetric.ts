import { z } from "zod/v4";
import { metricStatusSchema } from "./enums";
import { moneyMetricSchema } from "./moneyMetric";

/**
 * A bounded range of monetary values (e.g. a variable payment that falls
 * somewhere between a known minimum and maximum). Reuses `moneyMetricSchema`
 * for both bounds so each bound carries its own status/currency/confidence.
 */
export const moneyRangeMetricSchema = z
  .object({
    minimum: moneyMetricSchema,
    maximum: moneyMetricSchema,
    status: metricStatusSchema,
    source: z.string().nullable(),
    reason: z.string().nullable(),
  })
  .superRefine((data, ctx) => {
    if (
      data.minimum.value !== null &&
      data.maximum.value !== null &&
      data.minimum.value > data.maximum.value
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["minimum"],
        message: "minimum must not exceed maximum",
      });
    }

    if (
      data.minimum.currency !== null &&
      data.maximum.currency !== null &&
      data.minimum.currency !== data.maximum.currency
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["maximum", "currency"],
        message: "minimum and maximum currencies must be compatible (i.e. equal)",
      });
    }
  });

export type MoneyRangeMetric = z.infer<typeof moneyRangeMetricSchema>;
