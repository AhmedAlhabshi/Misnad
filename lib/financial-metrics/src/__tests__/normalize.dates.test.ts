import assert from "node:assert/strict";
import { daysBetweenIsoDates, normalizeToIsoDate } from "../normalize/dates";

export function run(): void {
  // Already-ISO, valid.
  assert.equal(normalizeToIsoDate("2026-01-15"), "2026-01-15");

  // Day-first slash/dash formats.
  assert.equal(normalizeToIsoDate("15/01/2026"), "2026-01-15");
  assert.equal(normalizeToIsoDate("15-01-2026"), "2026-01-15");
  assert.equal(normalizeToIsoDate("1/2/2026"), "2026-02-01");

  // Leap year: 2024-02-29 is valid, 2023-02-29 is not.
  assert.equal(normalizeToIsoDate("2024-02-29"), "2024-02-29");
  assert.equal(normalizeToIsoDate("2023-02-29"), null);
  assert.equal(normalizeToIsoDate("29/02/2024"), "2024-02-29");

  // Invalid calendar dates.
  assert.equal(normalizeToIsoDate("2026-02-30"), null);
  assert.equal(normalizeToIsoDate("2026-13-01"), null);

  // Partial dates must not be completed with invented components.
  assert.equal(normalizeToIsoDate("2026"), null);
  assert.equal(normalizeToIsoDate("2026-01"), null);

  // Unparseable / empty input.
  assert.equal(normalizeToIsoDate("sometime next year"), null);
  assert.equal(normalizeToIsoDate(""), null);
  assert.equal(normalizeToIsoDate(null), null);
  assert.equal(normalizeToIsoDate(undefined), null);

  // Calendar-safe day difference, timezone-independent (UTC midnight).
  assert.equal(daysBetweenIsoDates("2026-01-01", "2026-01-31"), 30);
  assert.equal(daysBetweenIsoDates("2024-02-01", "2024-03-01"), 29, "leap-year February must be 29 days");
  assert.equal(daysBetweenIsoDates("2026-01-01", "2026-01-01"), 0);
  assert.equal(daysBetweenIsoDates("bad", "2026-01-01"), null);

  console.log("PASS normalize.dates.test.ts");
}

run();
