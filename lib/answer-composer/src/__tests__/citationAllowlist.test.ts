import assert from "node:assert/strict";
import { buildCitationAllowlist, buildFactKeyAllowlist, sanitizeCitations, sanitizeFactKeys } from "../citationAllowlist";
import { buildGroundedContextFixture } from "./testFixtures";

export async function run(): Promise<void> {
  // --- Allowlist is built exactly from contract + legal evidence, never from financial/analysis facts ---
  {
    const context = buildGroundedContextFixture("all");
    const allowlist = buildCitationAllowlist(context);
    assert.equal(allowlist.length, 2, "one contract entry + one legal entry, never financial/analysis");
    assert.ok(allowlist.some((e) => e.source === "contract" && e.citation === context.contractEvidence[0].citation));
    assert.ok(allowlist.some((e) => e.source === "legal" && e.citation === context.legalEvidence[0].citation));
  }
  console.log("PASS buildCitationAllowlist is built only from contract + legal evidence");

  // --- A real citation survives sanitization, reconstructed from the allowlist, not from the model's echo ---
  {
    const context = buildGroundedContextFixture("legal");
    const allowlist = buildCitationAllowlist(context);
    const { citations, droppedCount } = sanitizeCitations([{ source: "legal", citation: context.legalEvidence[0].citation }], allowlist);
    assert.equal(droppedCount, 0);
    assert.equal(citations.length, 1);
    assert.equal(citations[0].authority, context.legalEvidence[0].authority);
    assert.equal(citations[0].excerpt, context.legalEvidence[0].excerpt);
  }
  console.log("PASS a real citation survives sanitization with server-reconstructed label/authority/excerpt");

  // --- A hallucinated citation (never present in GroundedContext) is dropped ---
  {
    const context = buildGroundedContextFixture("legal");
    const allowlist = buildCitationAllowlist(context);
    const { citations, droppedCount } = sanitizeCitations(
      [{ source: "legal", citation: "https://not-a-real-source.example.com/fabricated" }],
      allowlist,
    );
    assert.equal(citations.length, 0);
    assert.equal(droppedCount, 1);
  }
  console.log("PASS a hallucinated citation not present in GroundedContext is dropped");

  // --- A citation string that IS real but claimed under the wrong source is dropped ---
  {
    const context = buildGroundedContextFixture("contract_and_legal");
    const allowlist = buildCitationAllowlist(context);
    const { citations, droppedCount } = sanitizeCitations([{ source: "contract", citation: context.legalEvidence[0].citation }], allowlist);
    assert.equal(citations.length, 0, "a real citation string claimed under the wrong source must not be accepted");
    assert.equal(droppedCount, 1);
  }
  console.log("PASS a real citation claimed under the wrong source is dropped");

  // --- Duplicate citations are deduplicated ---
  {
    const context = buildGroundedContextFixture("legal");
    const allowlist = buildCitationAllowlist(context);
    const candidate = { source: "legal" as const, citation: context.legalEvidence[0].citation };
    const { citations, droppedCount } = sanitizeCitations([candidate, candidate], allowlist);
    assert.equal(citations.length, 1);
    assert.equal(droppedCount, 1);
  }
  console.log("PASS duplicate citations are deduplicated");

  // --- Financial fact keys: a real key survives, a hallucinated key is dropped ---
  {
    const context = buildGroundedContextFixture("financial");
    const allowlist = buildFactKeyAllowlist(context);
    const { factKeys, droppedCount } = sanitizeFactKeys([context.financialFacts[0].factKey, "totally_made_up_key"], allowlist);
    assert.deepEqual(factKeys, [context.financialFacts[0].factKey]);
    assert.equal(droppedCount, 1);
  }
  console.log("PASS a real financial fact key survives while a hallucinated one is dropped");

  // --- Empty context produces an empty allowlist, so everything is dropped ---
  {
    const context = buildGroundedContextFixture("general");
    const citationAllowlist = buildCitationAllowlist(context);
    const factKeyAllowlist = buildFactKeyAllowlist(context);
    const { citations } = sanitizeCitations([{ source: "contract", citation: "anything" }], citationAllowlist);
    const { factKeys } = sanitizeFactKeys(["anything"], factKeyAllowlist);
    assert.deepEqual(citations, []);
    assert.deepEqual(factKeys, []);
  }
  console.log("PASS an empty GroundedContext produces empty allowlists, so any claimed citation/factKey is dropped");

  console.log("PASS citationAllowlist.test.ts");
}

run();
