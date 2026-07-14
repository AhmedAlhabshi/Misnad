/**
 * Validates an already-numeric percentage value from an explicitly
 * percentage/rate-named field. Percentage points are used as-is (a stored
 * `5` means "5%") — this never reinterprets a fractional value like `0.05`
 * as `5%`, since that would be inventing a scale the source data never
 * stated. Returns `null` for anything non-finite or negative (the schema
 * itself has no upper bound).
 */
export function normalizePercentageValue(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

const PERCENT_CURRENCY_TEXTS = new Set(["%", "٪", "percent", "percentage", "pct"]);

/**
 * Detects when a `currency`-labeled field actually holds a percent marker
 * rather than a real currency (e.g. a penalty the model described as
 * `{ amount: 6, currency: "%" }` for "6% of the installment value") — the
 * `ContractUnderstanding` schema has no dedicated percentage field for
 * penalties/fees, so the model has no other way to express this.
 */
export function isPercentCurrencyText(raw: string | null | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) {
    return false;
  }
  if (trimmed.includes("%") || trimmed.includes("٪")) {
    return true;
  }
  return PERCENT_CURRENCY_TEXTS.has(trimmed);
}
