import { z } from "zod/v4";
import { moneyMetricSchema } from "./moneyMetric";

/**
 * Each entry is a per-currency total (reusing `moneyMetricSchema`, which
 * already carries its own `currency`). Entries must never be merged across
 * currencies — the refinement below only guards against the same currency
 * being represented more than once, it does not sum or convert anything.
 */
const totalsByCurrencySchema = z.array(moneyMetricSchema).superRefine((items, ctx) => {
  const seenCurrencies = new Set<string>();
  items.forEach((item, index) => {
    if (item.currency === null) {
      return;
    }
    if (seenCurrencies.has(item.currency)) {
      ctx.addIssue({
        code: "custom",
        path: [index, "currency"],
        message: `duplicate currency "${item.currency}" — each currency must be represented by exactly one entry`,
      });
    }
    seenCurrencies.add(item.currency);
  });
});

export const exposureSchema = z.object({
  totalKnownExposure: moneyMetricSchema,
  monthlyExposure: moneyMetricSchema,
  annualExposure: moneyMetricSchema,
  upfrontExposure: moneyMetricSchema,
  contingentExposure: moneyMetricSchema,
  maximumSinglePayment: moneyMetricSchema,
  unquantifiedContingentExposure: z.boolean().nullable(),
  totalsByCurrency: totalsByCurrencySchema,
});

export type Exposure = z.infer<typeof exposureSchema>;
