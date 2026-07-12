/** True for a finite, non-NaN number (rejects `NaN`, `Infinity`, `-Infinity`). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** True for a finite number that is zero or greater. */
export function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

/** True for a non-null, non-empty (after trimming) string. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Safely divides `numerator` by `denominator`, returning `null` instead of
 * `NaN`/`Infinity` when the division is not well-defined (zero or
 * non-finite denominator, or a non-finite numerator).
 */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator) || denominator === 0) {
    return null;
  }
  const result = numerator / denominator;
  return isFiniteNumber(result) ? result : null;
}
