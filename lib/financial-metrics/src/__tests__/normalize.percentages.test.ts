import assert from "node:assert/strict";
import { normalizePercentageValue } from "../normalize/percentages";

export function run(): void {
  assert.equal(normalizePercentageValue(5), 5, "5 (percentage points) must be used as-is, not reinterpreted as 0.05");
  assert.equal(normalizePercentageValue(0), 0);
  assert.equal(normalizePercentageValue(143.2), 143.2, "values above 100 must not be capped or rejected");
  assert.equal(normalizePercentageValue(null), null);
  assert.equal(normalizePercentageValue(undefined), null);
  assert.equal(normalizePercentageValue(-5), null, "a negative percentage must be rejected");
  assert.equal(normalizePercentageValue(Number.NaN), null);
  assert.equal(normalizePercentageValue(Number.POSITIVE_INFINITY), null);

  console.log("PASS normalize.percentages.test.ts");
}

run();
