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
