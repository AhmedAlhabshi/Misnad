import assert from "node:assert/strict";
import { getContractUnderstandingJsonSchemaFor } from "@workspace/contract-schema";

// Fields that only exist on other branches' typeDetails — used to prove the
// "other" branch stays narrowed to just its own fields.
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

  assert.equal(
    "detectedContractType" in schema.properties,
    false,
    "there must be no independent AI-detected contract type field in the schema",
  );

  console.log("PASS contractSchema.otherType.test.ts");
}

run();
