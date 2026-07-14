import { z } from "zod/v4";
import { costDifferenceClassificationSchema } from "./enums";
import { moneyMetricSchema } from "./moneyMetric";

export const costDifferenceSchema = z.object({
  classification: costDifferenceClassificationSchema,
  amount: moneyMetricSchema,
  reason: z.string().nullable(),
});

export type CostDifference = z.infer<typeof costDifferenceSchema>;

export const totalCostSchema = z.object({
  statedTotalCost: moneyMetricSchema,
  /** The financed/loan principal alone — see `calculators/costs.ts` for the full scope model. */
  calculatedBaseCost: moneyMetricSchema,
  /**
   * The guaranteed total *cash outflow* of the normal contract path — every
   * mandatory, non-conditional one-time payment (upfront payments AND any
   * balloon/final financing repayment) plus the scheduled recurring
   * commitment plus mandatory fees. This mixes pre-financing amounts (e.g. a
   * down payment) with financing repayment amounts by design — it answers
   * "how much cash will the customer pay in total", not "how much did
   * financing cost". Never compare this directly against `calculatedBaseCost`
   * to derive a financing-cost percentage — use `financingCost`/
   * `financingRepaymentTotal` (below) for that, which are scoped to exclude
   * pre-financing amounts.
   */
  calculatedCoreObligations: moneyMetricSchema,
  calculatedKnownCost: moneyMetricSchema,
  /**
   * The total amount that repays the financed principal: the scheduled
   * recurring commitment over the contract duration, plus any balloon/final
   * payment — deliberately excluding pre-financing amounts (a down payment,
   * an upfront fee) that reduce what needed to be financed rather than
   * repaying it. `unavailable` whenever no financed principal
   * (`calculatedBaseCost`) is known — this metric is only meaningful for
   * contracts that actually finance a principal amount (e.g. auto/personal
   * finance, mortgage), not a lease, subscription, or insurance policy.
   */
  financingRepaymentTotal: moneyMetricSchema,
  /**
   * `financingRepaymentTotal - calculatedBaseCost` — the extra amount paid
   * for financing itself (interest/profit), in the same currency. Only
   * "known" when both are known, in the same currency, and repayment is not
   * below principal (a below-principal reading means incomplete data, e.g.
   * an unresolved contract duration, not a real negative cost).
   */
  financingCost: moneyMetricSchema,
  estimatedContractCost: moneyMetricSchema,
  differenceFromStated: costDifferenceSchema,
});

export type TotalCost = z.infer<typeof totalCostSchema>;
