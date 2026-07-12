import { z } from "zod/v4";
import { checkUnavailableRequiresNullValueAndReason } from "./common";
import { confidenceSchema, metricStatusSchema } from "./enums";

/**
 * A single percentage data point (e.g. an APR, or a ratio expressed as a
 * percentage). Deliberately has no upper bound — increases, ratios, and
 * some rates can legitimately exceed 100.
 */
export const percentageMetricSchema = z
  .object({
    value: z.number().nonnegative().nullable(),
    status: metricStatusSchema,
    source: z.string().nullable(),
    reason: z.string().nullable(),
    confidence: confidenceSchema,
  })
  .superRefine((data, ctx) => {
    checkUnavailableRequiresNullValueAndReason(data, ctx);
  });

export type PercentageMetric = z.infer<typeof percentageMetricSchema>;
