import assert from "node:assert/strict";
import { legalSearchRequestSchema } from "../api/schema";

export function run(): void {
  // --- A valid request parses ---
  {
    const result = legalSearchRequestSchema.safeParse({
      query: "What is the maximum administrative fee?",
      contractType: "auto_finance",
      language: "AR",
      topics: ["fees"],
      topK: 5,
    });
    assert.equal(result.success, true);
  }
  console.log("PASS a valid legal-search request parses");

  // --- A minimal valid request (only required fields) parses ---
  {
    const result = legalSearchRequestSchema.safeParse({ query: "APR calculation", contractType: "auto_finance" });
    assert.equal(result.success, true);
  }
  console.log("PASS a minimal request with only the required fields parses");

  // --- An empty query is rejected ---
  {
    const result = legalSearchRequestSchema.safeParse({ query: "", contractType: "auto_finance" });
    assert.equal(result.success, false);
  }
  console.log("PASS an empty query is rejected");

  // --- An over-long query is rejected (bounded query length) ---
  {
    const result = legalSearchRequestSchema.safeParse({ query: "a".repeat(501), contractType: "auto_finance" });
    assert.equal(result.success, false);
  }
  console.log("PASS a query over the maximum length is rejected");

  // --- An invalid contractType is rejected, reusing the real ContractType enum rather than a duplicated string list ---
  {
    const result = legalSearchRequestSchema.safeParse({ query: "test", contractType: "not_a_real_contract_type" });
    assert.equal(result.success, false);
  }
  console.log("PASS an unrecognized contractType is rejected");

  // --- Too many topics is rejected (bounded topics count) ---
  {
    const result = legalSearchRequestSchema.safeParse({ query: "test", contractType: "auto_finance", topics: ["a", "b", "c", "d", "e", "f"] });
    assert.equal(result.success, false);
  }
  console.log("PASS more than the maximum number of topics is rejected");

  // --- topK above the safe maximum is rejected ---
  {
    const result = legalSearchRequestSchema.safeParse({ query: "test", contractType: "auto_finance", topK: 999 });
    assert.equal(result.success, false);
  }
  console.log("PASS a topK above the safe maximum is rejected");

  // --- topK of zero or negative is rejected ---
  {
    assert.equal(legalSearchRequestSchema.safeParse({ query: "test", contractType: "auto_finance", topK: 0 }).success, false);
    assert.equal(legalSearchRequestSchema.safeParse({ query: "test", contractType: "auto_finance", topK: -1 }).success, false);
  }
  console.log("PASS a topK of zero or negative is rejected");

  console.log("PASS apiSchema.validation.test.ts");
}

run();
