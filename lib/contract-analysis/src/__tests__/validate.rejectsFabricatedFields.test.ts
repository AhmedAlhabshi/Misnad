import assert from "node:assert/strict";
import { validateContractUnderstanding } from "../validate";

export function run(): void {
  const fabricated = {
    contractType: "other",
    parties: [],
    dates: [],
    penalties: [],
    fees: [],
    importantClauses: [],
    extractedNumbers: [],
    missingInformation: [],
    extractionNotes: null,
    typeDetails: { contractType: "other", description: null },
    payments: [
      { name: "Rent", amount: 3500, currency: "SAR" },
    ],
  };

  const result = validateContractUnderstanding(fabricated);

  assert.equal(
    result.success,
    false,
    'a result using an invented field name ("payments") instead of the required "financialObligations" field must be rejected',
  );
  assert.ok(
    result.errorSummary?.includes("financialObligations"),
    "the validation error summary should point at the missing required financialObligations field",
  );

  const valid = {
    contractType: "other",
    detectedContractType: "other",
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
  };

  const validResult = validateContractUnderstanding(valid);
  assert.equal(
    validResult.success,
    true,
    "a result matching the real schema fields exactly must be accepted",
  );

  console.log("PASS validate.rejectsFabricatedFields.test.ts");
}

run();
