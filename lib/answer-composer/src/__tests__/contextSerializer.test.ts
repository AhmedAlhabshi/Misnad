import assert from "node:assert/strict";
import { serializeGroundedContext } from "../contextSerializer";
import { buildGroundedContextFixture } from "./testFixtures";

export async function run(): Promise<void> {
  // --- Every section is labeled by source, and excerpts are preserved verbatim ---
  {
    const context = buildGroundedContextFixture("all");
    const serialized = serializeGroundedContext(context);
    assert.ok(serialized.includes("CONTRACT EVIDENCE"));
    assert.ok(serialized.includes("LEGAL EVIDENCE"));
    assert.ok(serialized.includes("FINANCIAL FACTS"));
    assert.ok(serialized.includes("ANALYSIS SUMMARY"));
    assert.ok(serialized.includes(context.contractEvidence[0].excerpt), "contract excerpt must appear verbatim");
    assert.ok(serialized.includes(context.legalEvidence[0].excerpt), "legal excerpt must appear verbatim");
    assert.ok(serialized.includes(context.financialFacts[0].excerpt), "financial fact excerpt must appear verbatim");
    assert.ok(serialized.includes(`Route: ${context.route}`));
  }
  console.log("PASS every evidence section is labeled by source and excerpts are preserved verbatim");

  // --- Untrusted content markers wrap the question and every excerpt ---
  {
    const context = buildGroundedContextFixture("contract");
    const serialized = serializeGroundedContext(context);
    const beginCount = (serialized.match(/BEGIN UNTRUSTED REFERENCE TEXT/g) ?? []).length;
    const endCount = (serialized.match(/END UNTRUSTED REFERENCE TEXT/g) ?? []).length;
    assert.ok(beginCount >= 2, "the question and the contract excerpt must each be wrapped");
    assert.equal(beginCount, endCount);
  }
  console.log("PASS untrusted-content markers wrap the question and every retrieved excerpt");

  // --- Empty evidence sections are omitted entirely, never sent as empty/undefined blocks ---
  {
    const context = buildGroundedContextFixture("general");
    const serialized = serializeGroundedContext(context);
    assert.ok(!serialized.includes("CONTRACT EVIDENCE"));
    assert.ok(!serialized.includes("LEGAL EVIDENCE"));
    assert.ok(!serialized.includes("FINANCIAL FACTS"));
    assert.ok(!serialized.includes("ANALYSIS SUMMARY"));
    assert.ok(serialized.includes("No retrieved evidence is available"));
  }
  console.log("PASS empty evidence sections are omitted entirely, with an explicit no-evidence note instead");

  // --- Only evidence actually present in the context appears — a route missing a category never gets that section ---
  {
    const context = buildGroundedContextFixture("contract");
    const serialized = serializeGroundedContext(context);
    assert.ok(serialized.includes("CONTRACT EVIDENCE"));
    assert.ok(!serialized.includes("LEGAL EVIDENCE"));
    assert.ok(!serialized.includes("FINANCIAL FACTS"));
    assert.ok(!serialized.includes("ANALYSIS SUMMARY"));
  }
  console.log("PASS only evidence categories actually present in the context are serialized");

  console.log("PASS contextSerializer.test.ts");
}

run();
