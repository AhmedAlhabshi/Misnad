import { z } from "zod/v4";
import { moneyMetricSchema } from "./moneyMetric";

/**
 * The actual monthly payment (what is really billed) is kept separate from
 * the calculated monthly equivalent (e.g. an annualized fee spread evenly
 * across 12 months) — they answer different questions and must never be
 * collapsed into a single field.
 */
export const recurringCommitmentSchema = z.object({
  actualMonthlyAmount: moneyMetricSchema,
  monthlyEquivalent: moneyMetricSchema,
  annualEquivalent: moneyMetricSchema,
  minimumMonthlyAmount: moneyMetricSchema,
  maximumMonthlyAmount: moneyMetricSchema,
  isVariable: z.boolean().nullable(),
  includedObligationIds: z.array(z.string()),
});

export type RecurringCommitment = z.infer<typeof recurringCommitmentSchema>;
