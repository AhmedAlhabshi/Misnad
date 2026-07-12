import assert from "node:assert/strict";
import { buildOpenRouterRequestBody } from "../providers/openRouterProvider";

export function run(): void {
  const body = buildOpenRouterRequestBody("qwen/qwen3-next-80b-a3b-instruct:free", {
    systemInstructions: "sys",
    userPrompt: "prompt",
  });

  assert.equal(
    body.model,
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "the model id must be forwarded verbatim",
  );
  assert.deepEqual(
    body.messages,
    [
      { role: "system", content: "sys" },
      { role: "user", content: "prompt" },
    ],
    "systemInstructions and userPrompt must be forwarded as system/user chat messages",
  );
  assert.deepEqual(
    body.response_format,
    { type: "json_object" },
    "basic json_object mode must be requested (broadly supported, unlike strict json_schema mode)",
  );
  assert.equal(
    body.max_tokens,
    65536,
    "max_tokens must match the current Gemini maxOutputTokens budget",
  );

  console.log("PASS openRouterProvider.requestBody.test.ts");
}

run();
