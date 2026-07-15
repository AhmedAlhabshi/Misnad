import { z } from "zod/v4";
import { idSchema, sourceFieldsSchema } from "./common";
import { financialRoleSchema, obligationTypeSchema, paymentFrequencySchema } from "./enums";
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
  /**
   * Whether this obligation (typically a deposit) is refundable. `null`
   * when genuinely unstated — never assumed either way. Previously tracked
   * only internally (see `pipeline/finalize.ts`'s refundability side-channel
   * map); now exposed directly so the presentation layer can distinguish a
   * refundable upfront amount from a permanent cost without a side-channel.
   */
  refundable: z.boolean().nullable(),
  /** The semantic role this value plays (income, a recurring/one-time outflow, a limit, ...) — see `FinancialRole`. */
  financialRole: financialRoleSchema,
  sourceFields: sourceFieldsSchema,
});

export type PaymentObligation = z.infer<typeof paymentObligationSchema>;
