import assert from "node:assert/strict";
import type { ContractUnderstanding } from "@workspace/contract-schema";
import { collectAnalysisFacts } from "../analysisCollector";

function baseAnalysis(overrides: Partial<ContractUnderstanding> = {}): ContractUnderstanding {
  return {
    contractType: "other",
    contractSummary: "This is a lease agreement between a landlord and a tenant.",
    contractSummarySimple: "You are renting a place from someone.",
    parties: [],
    financialObligations: [],
    dates: [],
    penalties: [],
    fees: [],
    importantClauses: [],
    extractedNumbers: [],
    missingInformation: [],
    extractionNotes: null,
    typeDetails: { contractType: "other", description: null },
    ...overrides,
  };
}

export async function run(): Promise<void> {
  // --- No analysis object: empty, no throw ---
  {
    const facts = collectAnalysisFacts(null, 6);
    assert.deepEqual(facts, []);
  }
  console.log("PASS collectAnalysisFacts returns an empty array when no ContractUnderstanding is provided");

  // --- Contract summary surfaces verbatim ---
  {
    const facts = collectAnalysisFacts(baseAnalysis(), 6);
    assert.equal(facts.length, 1);
    assert.equal(facts[0].source, "analysis");
    assert.equal(facts[0].authority, "contract_analysis_engine");
    assert.equal(facts[0].excerpt, "This is a lease agreement between a landlord and a tenant.", "the summary excerpt must be copied verbatim, never reworded");
  }
  console.log("PASS collectAnalysisFacts surfaces the contract summary verbatim");

  // --- Important clauses are capped by maxClauses ---
  {
    const analysis = baseAnalysis({
      importantClauses: Array.from({ length: 5 }, (_, i) => ({
        title: `Clause ${i}`,
        summary: `Summary of clause ${i}`,
        riskLevel: null,
        evidence: null,
        plainExplanation: `Plain explanation ${i}`,
      })),
    });
    const facts = collectAnalysisFacts(analysis, 2);
    const clauseFacts = facts.filter((f) => f.factKey.startsWith("important_clause:"));
    assert.equal(clauseFacts.length, 2, "must respect the configurable maxClauses cap");
    assert.ok(clauseFacts[0].excerpt.includes("Clause 0"));
    assert.ok(clauseFacts[0].excerpt.includes("Summary of clause 0"));
  }
  console.log("PASS collectAnalysisFacts caps important clauses at the configured limit");

  // --- Missing information surfaces as one fact when present ---
  {
    const analysis = baseAnalysis({ missingInformation: [{ field: "monthlyRent", reason: null }, { field: "leaseTermMonths", reason: null }] });
    const facts = collectAnalysisFacts(analysis, 6);
    const missingFact = facts.find((f) => f.factKey === "missing_information");
    assert.ok(missingFact, "a missing-information fact must be produced when the analysis lists any");
    assert.ok(missingFact!.excerpt.includes("monthlyRent"));
    assert.ok(missingFact!.excerpt.includes("leaseTermMonths"));
  }
  console.log("PASS collectAnalysisFacts surfaces missing-information fields when present");

  console.log("PASS analysisCollector.test.ts");
}

run();
