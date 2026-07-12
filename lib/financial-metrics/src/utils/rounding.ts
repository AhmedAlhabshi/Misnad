/**
 * Rounds to 2 decimal places using a string-based round-half-up, avoiding
 * classic binary floating-point artifacts (e.g. `0.1 + 0.2` must round to
 * `0.3`, not `0.30000000000000004`). Returns `0` (never `-0`) for values
 * that round to zero.
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`round2 requires a finite number, received ${value}`);
  }
  const rounded = Number(Math.round(Number(`${value}e2`)) + "e-2");
  return rounded === 0 ? 0 : rounded;
}

/** Rounds a duration day-count to a whole, non-negative integer. */
export function roundDays(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`roundDays requires a finite number, received ${value}`);
  }
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}
