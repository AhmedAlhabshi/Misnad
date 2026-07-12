import { z } from "zod/v4";
import { checkUnavailableRequiresNullValueAndReason } from "./common";
import { confidenceSchema, durationUnitSchema, metricStatusSchema } from "./enums";

/**
 * `months` and `days` are independent, separately-sourced representations
 * of the same duration, not a derived conversion of one another — the spec
 * explicitly forbids forcing an approximate days-to-months conversion, so
 * no cross-field refinement ties them together here.
 */
export const contractDurationSchema = z
  .object({
    value: z.number().nonnegative().nullable(),
    unit: durationUnitSchema.nullable(),
    months: z.number().nonnegative().nullable(),
    days: z.number().nonnegative().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    status: metricStatusSchema,
    source: z.string().nullable(),
    reason: z.string().nullable(),
    confidence: confidenceSchema,
  })
  .superRefine((data, ctx) => {
    checkUnavailableRequiresNullValueAndReason(data, ctx);
  });

export type ContractDuration = z.infer<typeof contractDurationSchema>;
