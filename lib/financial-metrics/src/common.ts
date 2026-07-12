import { z, type RefinementCtx } from "zod/v4";
import type { MetricStatus } from "./enums";

/** A short, non-empty identifier for a line item within a collection. */
export const idSchema = z.string().min(1);

/** An ISO-4217-style three-letter currency code (e.g. "SAR", "USD"). */
export const currencyCodeSchema = z.string().regex(
  /^[A-Z]{3}$/,
  "currency must be a 3-letter ISO-style currency code (e.g. SAR, USD)",
);

/** Field-path breadcrumbs back to the raw extracted/analyzed data a value came from. */
export const sourceFieldsSchema = z.array(z.string());

/**
 * Shared invariant for any "metric" shape (Money/Percentage/etc.) that
 * carries a `status`, a nullable numeric `value`, and a nullable `reason`:
 * when `status` is "unavailable", `value` must be null (never coerced to 0)
 * and a non-empty `reason` must be given.
 */
export function checkUnavailableRequiresNullValueAndReason(
  data: { status: MetricStatus; value: number | null; reason: string | null },
  ctx: RefinementCtx,
): void {
  if (data.status !== "unavailable") {
    return;
  }

  if (data.value !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: 'value must be null when status is "unavailable"',
    });
  }

  if (!data.reason || data.reason.trim().length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["reason"],
      message: 'a non-empty reason is required when status is "unavailable"',
    });
  }
}

/**
 * Wraps an item schema (which must infer an object with an `id: string`
 * field) in an array schema that additionally rejects duplicate ids —
 * used for every collection in this package where each item is expected to
 * be independently addressable (payment obligations, fees, penalties,
 * positive financial factors).
 */
export function uniqueIdArray<Item extends z.ZodType<{ id: string }>>(itemSchema: Item) {
  return z.array(itemSchema).superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `duplicate id "${item.id}" — ids must be unique within this collection`,
        });
      }
      seen.add(item.id);
    });
  });
}
