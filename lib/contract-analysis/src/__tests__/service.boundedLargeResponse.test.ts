import assert from "node:assert/strict";
import { analyzeContract } from "../service";
import type {
  ContractAnalysisProvider,
  ContractAnalysisProviderRequest,
} from "../providers/types";

function repeat<T>(n: number, factory: (index: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => factory(i));
}

/**
 * Proves that a response sized right at the new schema limits (the largest
 * shape a real long template contract should now ever need to produce)
 * still validates successfully on the first attempt — no truncation, no
 * correction retry needed, confirming the bounded output fits comfortably
 * within a single valid JSON response.
 */
export async function run(): Promise<void> {
  const clauseEvidence = repeat(30, (i) => `Clause ${i} supporting sentence from the contract.`);
  const maskedText = `Masked long template contract, unique-marker-b19d4e. ${clauseEvidence.join(" ")}`;

  let callCount = 0;

  const fakeProvider: ContractAnalysisProvider = {
    async generate(_request: ContractAnalysisProviderRequest) {
      callCount += 1;
      return {
        rawText: JSON.stringify({
          contractType: "other",
          contractSummary: "c".repeat(500),
          contractSummarySimple: "c".repeat(350),
          parties: repeat(6, (i) => ({
            role: `Role ${i}`,
            name: null,
            identifier: null,
            notes: null,
          })),
          financialObligations: repeat(12, (i) => ({
            description: `Obligation ${i}`,
            amount: 1000 + i,
            currency: "SAR",
            frequency: "Monthly",
            dueDate: null,
          })),
          dates: repeat(12, (i) => ({ label: `Date ${i}`, date: "2026-01-01", notes: null })),
          penalties: repeat(10, (i) => ({
            description: `Penalty ${i}`,
            amount: null,
            currency: null,
            condition: "Late payment",
          })),
          fees: repeat(10, (i) => ({
            description: `Fee ${i}`,
            amount: 50,
            currency: "SAR",
            isRecurring: false,
          })),
          importantClauses: repeat(30, (i) => ({
            title: `Clause ${i}`,
            summary: `Summary of clause ${i}`,
            riskLevel: "medium" as const,
            evidence: clauseEvidence[i],
            plainExplanation: `Plain explanation of clause ${i}`,
          })),
          extractedNumbers: repeat(20, (i) => ({ label: `Number ${i}`, value: i, unit: null })),
          missingInformation: repeat(15, (i) => ({ field: `field${i}`, reason: null })),
          extractionNotes: "n".repeat(700),
          typeDetails: { contractType: "other", description: null },
        }),
      };
    },
  };

  const result = await analyzeContract(maskedText, "other", "en", { provider: fakeProvider });

  assert.equal(callCount, 1, "a valid bounded response must succeed on the first attempt (no correction needed)");
  assert.equal(result.parties.length, 6);
  assert.equal(result.financialObligations.length, 12);
  assert.equal(result.dates.length, 12);
  assert.equal(result.penalties.length, 10);
  assert.equal(result.fees.length, 10);
  assert.equal(result.importantClauses.length, 30);
  assert.equal(result.extractedNumbers.length, 20);
  assert.equal(result.missingInformation.length, 15);
  assert.equal(result.extractionNotes?.length, 700);

  result.importantClauses.forEach((clause, i) => {
    assert.equal(clause.evidence, clauseEvidence[i], `clause ${i}'s evidence must round-trip unchanged`);
  });

  console.log("PASS service.boundedLargeResponse.test.ts");
}

run();
