import assert from "node:assert/strict";
import { riskRank } from "../financialPresentation";

export function run(): void {
  assert.equal(riskRank("high"), 0);
  assert.equal(riskRank("medium"), 1);
  assert.equal(riskRank("low"), 2);
  assert.equal(riskRank(null), 3);
  console.log("PASS riskRank orders high < medium < low < unrated");

  console.log("PASS financialPresentation.test.ts");
}

run();
