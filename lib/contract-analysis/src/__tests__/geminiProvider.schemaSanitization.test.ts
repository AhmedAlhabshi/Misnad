import assert from "node:assert/strict";
import { getContractUnderstandingJsonSchemaFor } from "@workspace/contract-schema";
import { sanitizeJsonSchemaForGemini } from "../providers/geminiProvider";

function collectKeysRecursively(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeysRecursively(item, keys);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      keys.add(key);
      collectKeysRecursively(val, keys);
    }
  }
}

export function run(): void {
  // a. The normal shared/generated JSON Schema still contains maxItems and maxLength.
  const rawSchema = getContractUnderstandingJsonSchemaFor("auto_finance") as Record<string, unknown>;
  const rawKeys = new Set<string>();
  collectKeysRecursively(rawSchema, rawKeys);
  assert.ok(rawKeys.has("maxItems"), "the raw generated schema must still carry maxItems from Zod's .max() array limits");
  assert.ok(rawKeys.has("maxLength"), "the raw generated schema must still carry maxLength from Zod's .max() text limits");

  // b. The Gemini provider-facing sanitized schema does not contain
  // maxItems or maxLength recursively (checked on a hand-built nested
  // fixture, and again on the real generated schema below).
  const nestedFixture = {
    type: "object",
    properties: {
      items: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            evidence: { type: "string", maxLength: 350, nested: { maxItems: 3, maxLength: 3 } },
          },
        },
      },
    },
  };
  const sanitizedFixture = sanitizeJsonSchemaForGemini(nestedFixture) as Record<string, unknown>;
  const sanitizedFixtureKeys = new Set<string>();
  collectKeysRecursively(sanitizedFixture, sanitizedFixtureKeys);
  assert.equal(sanitizedFixtureKeys.has("maxItems"), false, "maxItems must be recursively removed");
  assert.equal(sanitizedFixtureKeys.has("maxLength"), false, "maxLength must be recursively removed, including nested occurrences");

  const sanitizedRealSchema = sanitizeJsonSchemaForGemini(rawSchema) as Record<string, unknown>;
  const sanitizedRealKeys = new Set<string>();
  collectKeysRecursively(sanitizedRealSchema, sanitizedRealKeys);
  assert.equal(
    sanitizedRealKeys.has("maxItems"),
    false,
    "the real generated schema, once sanitized for Gemini, must not contain maxItems anywhere",
  );
  assert.equal(
    sanitizedRealKeys.has("maxLength"),
    false,
    "the real generated schema, once sanitized for Gemini, must not contain maxLength anywhere",
  );

  // c. Required fields, enums, contract-type discriminators, object
  // properties, and schema structure remain present.
  assert.ok(sanitizedRealKeys.has("required"), "required-field lists must survive sanitization");
  assert.ok(sanitizedRealKeys.has("properties"), "object property definitions must survive sanitization");
  assert.ok(sanitizedRealKeys.has("enum"), "enum constraints (including the contractType discriminator) must survive sanitization");
  assert.ok(sanitizedRealKeys.has("type"), "type declarations must survive sanitization");
  assert.equal(
    (sanitizedRealSchema.properties as Record<string, { enum?: unknown[] }>).contractType.enum?.[0],
    "auto_finance",
    "the narrowed contractType discriminator value must be preserved exactly",
  );
  assert.deepEqual(
    (sanitizedFixture.properties as Record<string, unknown>).items,
    {
      type: "array",
      items: {
        type: "object",
        properties: {
          evidence: { type: "string", nested: {} },
        },
      },
    },
    "only maxItems/maxLength keys must be removed — all other structure must be byte-for-byte identical",
  );

  // d. The original schema object is not mutated.
  assert.ok(
    "maxItems" in (nestedFixture.properties.items as Record<string, unknown>),
    "the original fixture object must still have maxItems after sanitization — it must not be mutated in place",
  );
  assert.equal(
    (nestedFixture.properties.items as { maxItems: number }).maxItems,
    10,
    "the original fixture's maxItems value must be untouched",
  );
  const rawKeysAfter = new Set<string>();
  collectKeysRecursively(rawSchema, rawKeysAfter);
  assert.ok(
    rawKeysAfter.has("maxItems") && rawKeysAfter.has("maxLength"),
    "the original shared generated schema object must still contain maxItems/maxLength after being sanitized for Gemini — sanitization must operate on a copy",
  );

  console.log("PASS geminiProvider.schemaSanitization.test.ts");
}

run();
