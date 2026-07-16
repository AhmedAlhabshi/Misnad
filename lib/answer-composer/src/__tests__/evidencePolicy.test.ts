import assert from "node:assert/strict";
import { deriveConfidence, deriveEvidenceStatus } from "../evidencePolicy";
import { buildGroundedContextFixture } from "./testFixtures";

export async function run(): Promise<void> {
  // --- general always sufficient/high, regardless of evidence ---
  {
    const context = buildGroundedContextFixture("general");
    assert.equal(deriveEvidenceStatus(context), "sufficient");
    assert.equal(deriveConfidence(context, "sufficient", 0, 0), "high");
  }
  console.log("PASS general route is always evidenceStatus=sufficient, confidence=high");

  // --- contract route: evidence present -> sufficient; empty -> insufficient ---
  {
    const withEvidence = buildGroundedContextFixture("contract");
    assert.equal(deriveEvidenceStatus(withEvidence), "sufficient");

    const withoutEvidence = buildGroundedContextFixture("contract", { contractEvidence: [] });
    assert.equal(deriveEvidenceStatus(withoutEvidence), "insufficient");
    assert.equal(deriveConfidence(withoutEvidence, "insufficient", 0, 0), "low");
  }
  console.log("PASS contract route: present evidence -> sufficient, empty -> insufficient/low");

  // --- contract_and_legal: only one side present -> partial ---
  {
    const context = buildGroundedContextFixture("contract_and_legal", { legalEvidence: [] });
    assert.equal(deriveEvidenceStatus(context), "partial");
    assert.equal(deriveConfidence(context, "partial", 1, 0), "medium");
  }
  console.log("PASS contract_and_legal with only one side present is evidenceStatus=partial, confidence=medium");

  // --- contract_and_legal: both sides present but the answer used no citations at all -> confidence downgraded to medium ---
  {
    const context = buildGroundedContextFixture("contract_and_legal");
    const evidenceStatus = deriveEvidenceStatus(context);
    assert.equal(evidenceStatus, "sufficient");
    assert.equal(deriveConfidence(context, evidenceStatus, 0, 0), "medium", "sufficient evidence existed but the sanitized answer cited none of it — must not be reported as high confidence");
  }
  console.log("PASS sufficient evidence with zero surviving citations downgrades confidence to medium, never high");

  // --- contract_and_legal: both sides present and the answer used at least one citation from each needed category -> high ---
  {
    const context = buildGroundedContextFixture("contract_and_legal");
    const evidenceStatus = deriveEvidenceStatus(context);
    assert.equal(deriveConfidence(context, evidenceStatus, 2, 0), "high");
  }
  console.log("PASS sufficient evidence with surviving citations yields confidence=high");

  // --- financial route: needs fact keys, not citations ---
  {
    const context = buildGroundedContextFixture("financial");
    const evidenceStatus = deriveEvidenceStatus(context);
    assert.equal(evidenceStatus, "sufficient");
    assert.equal(deriveConfidence(context, evidenceStatus, 0, 0), "medium", "financial route needs surviving fact keys, not citations");
    assert.equal(deriveConfidence(context, evidenceStatus, 0, 1), "high");
  }
  console.log("PASS financial route confidence depends on surviving fact keys, not citations");

  // --- all route: every category present -> sufficient; two of three missing -> partial; all missing -> insufficient ---
  {
    const full = buildGroundedContextFixture("all");
    assert.equal(deriveEvidenceStatus(full), "sufficient");

    const twoMissing = buildGroundedContextFixture("all", { legalEvidence: [], financialFacts: [] });
    assert.equal(deriveEvidenceStatus(twoMissing), "partial");

    const allMissing = buildGroundedContextFixture("all", { contractEvidence: [], legalEvidence: [], financialFacts: [] });
    assert.equal(deriveEvidenceStatus(allMissing), "insufficient");
  }
  console.log("PASS all route: evidenceStatus reflects how many of the three required categories are present");

  console.log("PASS evidencePolicy.test.ts");
}

run();
