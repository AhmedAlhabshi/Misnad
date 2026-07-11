import assert from "node:assert/strict";
import { getContractUnderstandingJsonSchemaFor } from "@workspace/contract-schema";

const OTHER_CONTRACT_TYPE_LITERALS = [
  "auto_finance",
  "personal_finance",
  "mortgage",
  "credit_card",
  "lease",
  "insurance",
  "employment",
  "subscription",
];

// Fields that only exist on other branches' typeDetails — used to prove the
// "other" branch stays narrowed even though detectedContractType now
// legitimately references every literal.
const OTHER_BRANCH_TYPE_DETAIL_FIELDS = [
  "vehicleMake",
  "loanAmount",
  "propertyAddress",
  "creditLimit",
  "monthlyRent",
  "insuranceType",
  "jobTitle",
  "serviceName",
];

export function run(): void {
  const schema = getContractUnderstandingJsonSchemaFor("other") as {
    properties: Record<string, { enum?: unknown[] }>;
  };
  const serialized = JSON.stringify(schema);

  assert.deepEqual(
    schema.properties.contractType.enum,
    ["other"],
    'the narrowed "contractType" field must only allow the "other" literal',
  );

  for (const field of OTHER_BRANCH_TYPE_DETAIL_FIELDS) {
    assert.equal(
      serialized.includes(`"${field}"`),
      false,
      `schema for contractType "other" must not reference the "${field}" field from another branch's typeDetails`,
    );
  }

  assert.ok(
    serialized.includes('"other"'),
    'schema for contractType "other" must still reference the "other" literal itself',
  );

  assert.deepEqual(
    new Set(schema.properties.detectedContractType.enum),
    new Set([...OTHER_CONTRACT_TYPE_LITERALS, "other"]),
    'the "detectedContractType" field must allow the full canonical ContractType enum regardless of the narrowed contractType',
  );

  console.log("PASS contractSchema.otherType.test.ts");
}

run();
