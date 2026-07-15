import assert from "node:assert/strict";
import { validateContractUnderstanding } from "../validate";

const BASE_FIELDS = {
  contractType: "other" as const,
  contractSummary: "Contract summary.",
  contractSummarySimple: "Simple contract summary.",
  parties: [],
  financialObligations: [],
  dates: [],
  penalties: [],
  fees: [],
  extractedNumbers: [],
  missingInformation: [],
  extractionNotes: null,
  typeDetails: { contractType: "other" as const, description: null },
};

function clauseCandidate(evidence: string | null) {
  return {
    ...BASE_FIELDS,
    importantClauses: [
      {
        title: "Late payment penalty",
        summary: "A 2% penalty applies for each day of delay.",
        riskLevel: "medium" as const,
        evidence,
        plainExplanation: "Pay on time to avoid the extra 2% daily charge.",
      },
    ],
  };
}

export function run(): void {
  const maskedText =
    "This lease requires monthly rent. A late penalty of 2% per day applies, up to [NATIONAL_ID] identification on file. Tenant: [NATIONAL_ID].";

  // a. Valid verbatim evidence contained in maskedText is accepted.
  const validEvidence = "A late penalty of 2% per day applies";
  const acceptedResult = validateContractUnderstanding(
    clauseCandidate(validEvidence),
    maskedText,
  );
  assert.equal(
    acceptedResult.success,
    true,
    "evidence that is an exact verbatim substring of maskedText must be accepted",
  );

  // b. Fabricated evidence not contained in maskedText is rejected.
  const fabricatedResult = validateContractUnderstanding(
    clauseCandidate("The tenant must pay a penalty of 500 SAR immediately."),
    maskedText,
  );
  assert.equal(
    fabricatedResult.success,
    false,
    "evidence that does not appear verbatim in maskedText must be rejected",
  );
  assert.ok(
    fabricatedResult.errorSummary?.includes("evidence"),
    "the validation error summary must point at the invalid evidence field",
  );

  // c. null evidence is accepted.
  const nullEvidenceResult = validateContractUnderstanding(clauseCandidate(null), maskedText);
  assert.equal(
    nullEvidenceResult.success,
    true,
    "a null evidence value must be accepted (no reliable excerpt is a valid outcome)",
  );

  // e. PII placeholders inside evidence remain unchanged (still an exact substring match).
  const evidenceWithPii = "Tenant: [NATIONAL_ID].";
  const piiResult = validateContractUnderstanding(clauseCandidate(evidenceWithPii), maskedText);
  assert.equal(
    piiResult.success,
    true,
    "evidence containing an unmodified PII placeholder that matches maskedText verbatim must be accepted",
  );

  // A near-miss (e.g. a placeholder subtly altered) must still be rejected as fabricated.
  const alteredPiiResult = validateContractUnderstanding(
    clauseCandidate("Tenant: [NATIONAL ID]."),
    maskedText,
  );
  assert.equal(
    alteredPiiResult.success,
    false,
    "evidence with an altered PII placeholder (not an exact match) must be rejected",
  );

  console.log("PASS validate.evidenceIntegrity.test.ts");
}

run();
