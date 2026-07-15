import assert from "node:assert/strict";
import { formatEmergencyCoverageMonths } from "../emergencyCoverageWording";

export function run(): void {
  assert.equal(formatEmergencyCoverageMonths(0, "ar"), "أقل من شهر واحد");
  assert.equal(formatEmergencyCoverageMonths(0.4, "ar"), "أقل من شهر واحد");
  assert.equal(formatEmergencyCoverageMonths(0, "en"), "Less than one month");
  console.log("PASS formatEmergencyCoverageMonths handles less-than-a-month");

  assert.equal(formatEmergencyCoverageMonths(1, "ar"), "حوالي شهر واحد", "Arabic singular");
  assert.equal(formatEmergencyCoverageMonths(1.2, "ar"), "حوالي شهر واحد", "rounds to nearest whole month before wording");
  assert.equal(formatEmergencyCoverageMonths(1, "en"), "About 1 month");
  console.log("PASS formatEmergencyCoverageMonths handles the singular (1 month) case");

  assert.equal(formatEmergencyCoverageMonths(2, "ar"), "حوالي شهرين", "Arabic dual");
  assert.equal(formatEmergencyCoverageMonths(1.6, "ar"), "حوالي شهرين", "1.6 rounds to 2 -> dual form");
  assert.equal(formatEmergencyCoverageMonths(2, "en"), "About 2 months");
  console.log("PASS formatEmergencyCoverageMonths handles the dual (2 months) case");

  assert.equal(formatEmergencyCoverageMonths(3, "ar"), "حوالي 3 أشهر", "Arabic plural (3-10)");
  assert.equal(formatEmergencyCoverageMonths(10, "ar"), "حوالي 10 أشهر");
  assert.equal(formatEmergencyCoverageMonths(3, "en"), "About 3 months");
  console.log("PASS formatEmergencyCoverageMonths handles the 3-10 plural case");

  assert.equal(formatEmergencyCoverageMonths(11, "ar"), "حوالي 11 شهراً", "Arabic 11+ uses the singular-accusative plural form");
  assert.equal(formatEmergencyCoverageMonths(24, "ar"), "حوالي 24 شهراً");
  assert.equal(formatEmergencyCoverageMonths(11, "en"), "About 11 months");
  console.log("PASS formatEmergencyCoverageMonths handles the 11+ case");

  console.log("PASS emergencyCoverageWording.test.ts");
}

run();
