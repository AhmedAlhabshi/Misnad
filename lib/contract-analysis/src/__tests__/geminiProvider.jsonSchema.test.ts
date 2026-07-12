import assert from "node:assert/strict";
import { buildGenerateContentParams } from "../providers/geminiProvider";

export function run(): void {
  const fakeJsonSchema = { type: "object", properties: {}, required: [] };

  const withSchema = buildGenerateContentParams("gemini-2.5-flash", {
    systemInstructions: "sys",
    userPrompt: "prompt",
    jsonSchema: fakeJsonSchema,
  });

  assert.equal(
    withSchema.config.responseMimeType,
    "application/json",
    "responseMimeType must still be application/json when a jsonSchema is provided",
  );
  assert.deepEqual(
    (withSchema.config as Record<string, unknown>).responseJsonSchema,
    fakeJsonSchema,
    "the jsonSchema passed to the request must be forwarded verbatim via config.responseJsonSchema",
  );
  assert.equal(
    "responseSchema" in withSchema.config,
    false,
    "responseSchema (the older field) must not be set when using responseJsonSchema",
  );
  assert.equal(
    withSchema.config.maxOutputTokens,
    65536,
    "maxOutputTokens must be 65536 (gemini-2.5-flash's documented output limit) to avoid truncating large real-contract structured output (raised from 16384 after live MAX_TOKENS failures)",
  );

  const withoutSchema = buildGenerateContentParams("gemini-2.5-flash", {
    systemInstructions: "sys",
    userPrompt: "prompt",
  });

  assert.equal(
    "responseJsonSchema" in withoutSchema.config,
    false,
    "responseJsonSchema must be omitted entirely when no jsonSchema is provided",
  );

  console.log("PASS geminiProvider.jsonSchema.test.ts");
}

run();
