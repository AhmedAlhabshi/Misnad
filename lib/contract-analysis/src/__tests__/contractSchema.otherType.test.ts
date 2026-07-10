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

export function run(): void {
  const schema = getContractUnderstandingJsonSchemaFor("other");
  const serialized = JSON.stringify(schema);

  for (const literal of OTHER_CONTRACT_TYPE_LITERALS) {
    assert.equal(
      serialized.includes(`"${literal}"`),
      false,
      `schema for contractType "other" must not reference the "${literal}" branch of the union`,
    );
  }

  assert.ok(
    serialized.includes('"other"'),
    'schema for contractType "other" must still reference the "other" literal itself',
  );

  console.log("PASS contractSchema.otherType.test.ts");
}

run();
