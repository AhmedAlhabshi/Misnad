import assert from "node:assert/strict";
import { validateContractUnderstanding } from "../validate";

function baseCandidate(overrides: Record<string, unknown> = {}) {
  return {
    contractType: "other",
    contractSummary: "Contract summary.",
    contractSummarySimple: "Simple contract summary.",
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

function repeat<T>(n: number, factory: (index: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => factory(i));
}

export function run(): void {
  // a. Arrays above the configured maximum are rejected.
  const tooManyParties = baseCandidate({
    parties: repeat(7, (i) => ({ role: `Party ${i}`, name: null, identifier: null, notes: null })),
  });
  assert.equal(
    validateContractUnderstanding(tooManyParties, "masked text").success,
    false,
    "more than 6 parties must be rejected",
  );

  const atMaxParties = baseCandidate({
    parties: repeat(6, (i) => ({ role: `Party ${i}`, name: null, identifier: null, notes: null })),
  });
  assert.equal(
    validateContractUnderstanding(atMaxParties, "masked text").success,
    true,
    "exactly 6 parties (the configured maximum) must be accepted",
  );

  const tooManyClauses = baseCandidate({
    importantClauses: repeat(31, (i) => ({
      title: `Clause ${i}`,
      summary: "Summary text",
      riskLevel: null,
      evidence: null,
      plainExplanation: "Plain explanation.",
    })),
  });
  assert.equal(
    validateContractUnderstanding(tooManyClauses, "masked text").success,
    false,
    "more than 30 importantClauses must be rejected",
  );

  const atMaxClauses = baseCandidate({
    importantClauses: repeat(30, (i) => ({
      title: `Clause ${i}`,
      summary: "Summary text",
      riskLevel: null,
      evidence: null,
      plainExplanation: "Plain explanation.",
    })),
  });
  assert.equal(
    validateContractUnderstanding(atMaxClauses, "masked text").success,
    true,
    "exactly 30 importantClauses (the configured maximum) must be accepted",
  );

  const tooManyExtractedNumbers = baseCandidate({
    extractedNumbers: repeat(21, (i) => ({ label: `Number ${i}`, value: i, unit: null })),
  });
  assert.equal(
    validateContractUnderstanding(tooManyExtractedNumbers, "masked text").success,
    false,
    "more than 20 extractedNumbers must be rejected",
  );

  const tooManyMissingInfo = baseCandidate({
    missingInformation: repeat(16, (i) => ({ field: `field${i}`, reason: null })),
  });
  assert.equal(
    validateContractUnderstanding(tooManyMissingInfo, "masked text").success,
    false,
    "more than 15 missingInformation entries must be rejected",
  );

  const tooManyFinancialObligations = baseCandidate({
    financialObligations: repeat(13, (i) => ({
      description: `Obligation ${i}`,
      amount: null,
      currency: null,
      frequency: null,
      dueDate: null,
    })),
  });
  assert.equal(
    validateContractUnderstanding(tooManyFinancialObligations, "masked text").success,
    false,
    "more than 12 financialObligations must be rejected",
  );

  // b. Overly long text fields are rejected, even when otherwise valid.
  const longEvidence = "x".repeat(351);
  const overLongEvidence = baseCandidate({
    importantClauses: [
      { title: "Title", summary: "Summary", riskLevel: null, evidence: longEvidence, plainExplanation: "Plain explanation." },
    ],
  });
  // maskedText contains the excerpt verbatim, so only the length limit
  // (not substring-integrity) is what must cause this to fail.
  assert.equal(
    validateContractUnderstanding(overLongEvidence, longEvidence).success,
    false,
    "evidence longer than 350 characters must be rejected even when it is an exact verbatim substring of maskedText",
  );

  const overLongSummary = baseCandidate({
    importantClauses: [
      { title: "Title", summary: "s".repeat(501), riskLevel: null, evidence: null, plainExplanation: "Plain explanation." },
    ],
  });
  assert.equal(
    validateContractUnderstanding(overLongSummary, "masked text").success,
    false,
    "a clause summary longer than 500 characters must be rejected",
  );

  const overLongPlainExplanation = baseCandidate({
    importantClauses: [
      { title: "Title", summary: "Summary", riskLevel: null, evidence: null, plainExplanation: "p".repeat(351) },
    ],
  });
  assert.equal(
    validateContractUnderstanding(overLongPlainExplanation, "masked text").success,
    false,
    "a clause plainExplanation longer than 350 characters must be rejected",
  );

  const overLongContractSummary = baseCandidate({ contractSummary: "c".repeat(501) });
  assert.equal(
    validateContractUnderstanding(overLongContractSummary, "masked text").success,
    false,
    "contractSummary longer than 500 characters must be rejected",
  );

  const overLongContractSummarySimple = baseCandidate({ contractSummarySimple: "c".repeat(351) });
  assert.equal(
    validateContractUnderstanding(overLongContractSummarySimple, "masked text").success,
    false,
    "contractSummarySimple longer than 350 characters must be rejected",
  );

  const missingContractSummary = baseCandidate({ contractSummary: undefined });
  assert.equal(
    validateContractUnderstanding(missingContractSummary, "masked text").success,
    false,
    "contractSummary is required and must be rejected when missing",
  );

  const overLongExtractionNotes = baseCandidate({ extractionNotes: "n".repeat(701) });
  assert.equal(
    validateContractUnderstanding(overLongExtractionNotes, "masked text").success,
    false,
    "extractionNotes longer than 700 characters must be rejected",
  );

  const atMaxExtractionNotes = baseCandidate({ extractionNotes: "n".repeat(700) });
  assert.equal(
    validateContractUnderstanding(atMaxExtractionNotes, "masked text").success,
    true,
    "extractionNotes at exactly 700 characters must be accepted",
  );

  console.log("PASS contractSchema.limits.test.ts");
}

run();
