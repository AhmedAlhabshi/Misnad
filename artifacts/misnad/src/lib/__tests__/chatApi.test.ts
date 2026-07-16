import assert from "node:assert/strict";
import {
  buildChatRequestPayload,
  canSendQuestion,
  isQuestionEmpty,
  isQuestionOverLimit,
  MAX_QUESTION_LENGTH,
  remainingQuestionCharacters,
  sendChatMessage,
} from "../chatApi";

function testBuildChatRequestPayloadOnlyAllowedFields(): void {
  const payload = buildChatRequestPayload({
    question: "What does my contract say?",
    contractRagSessionId: "abc123def456ghi789jkl012mno345pq",
    selectedContractType: "auto_finance",
    answerLanguage: "en",
    financialMetrics: null,
    contractAnalysis: null,
  });

  const keys = Object.keys(payload).sort();
  assert.deepEqual(keys, ["answerLanguage", "contractRagSessionId", "question", "selectedContractType"]);
  assert.equal(payload.answerLanguage, "EN", "answerLanguage must be mapped to uppercase AR/EN for the API");

  // The payload's own TYPE has no room for a route, requiredSources, citation, or chunk id —
  // this assertion documents that guarantee at the value level too.
  assert.ok(!("route" in payload));
  assert.ok(!("requiredSources" in payload));
  assert.ok(!("citationUrl" in payload));
  assert.ok(!("chunkId" in payload));
  assert.ok(!("rawText" in payload));
  assert.ok(!("maskedText" in payload));

  console.log("PASS buildChatRequestPayload includes only the allowed fields, with the route never present");
}

function testBuildChatRequestPayloadOmitsAbsentOptionalFields(): void {
  const payload = buildChatRequestPayload({
    question: "What is RAG?",
    contractRagSessionId: null,
    selectedContractType: "other",
    answerLanguage: "ar",
    financialMetrics: null,
    contractAnalysis: null,
  });

  assert.deepEqual(Object.keys(payload).sort(), ["answerLanguage", "question", "selectedContractType"]);
  assert.equal(payload.answerLanguage, "AR");
  assert.ok(!("contractRagSessionId" in payload), "a null sessionId must be omitted, never sent as an explicit null");
  assert.ok(!("financialMetrics" in payload));
  assert.ok(!("contractAnalysis" in payload));

  console.log("PASS buildChatRequestPayload omits absent optional fields entirely (never sends null)");
}

function testQuestionValidationHelpers(): void {
  assert.equal(isQuestionEmpty(""), true);
  assert.equal(isQuestionEmpty("   "), true, "whitespace-only must be treated as empty");
  assert.equal(isQuestionEmpty("hello"), false);

  assert.equal(isQuestionOverLimit("a".repeat(MAX_QUESTION_LENGTH)), false);
  assert.equal(isQuestionOverLimit("a".repeat(MAX_QUESTION_LENGTH + 1)), true);

  assert.equal(remainingQuestionCharacters(""), MAX_QUESTION_LENGTH);
  assert.equal(remainingQuestionCharacters("abc"), MAX_QUESTION_LENGTH - 3);

  console.log("PASS question validation helpers (empty, whitespace-only, over-length, remaining count)");
}

function testCanSendQuestion(): void {
  assert.equal(canSendQuestion("hello", false), true);
  assert.equal(canSendQuestion("", false), false, "empty question must be blocked");
  assert.equal(canSendQuestion("   ", false), false, "whitespace-only question must be blocked");
  assert.equal(canSendQuestion("a".repeat(MAX_QUESTION_LENGTH + 1), false), false, "over-length question must be blocked");
  assert.equal(canSendQuestion("hello", true), false, "a question must be blocked while already sending (duplicate-send guard)");

  console.log("PASS canSendQuestion blocks empty, whitespace-only, over-length, and in-flight duplicate sends");
}

async function testSendChatMessageSuccess(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        success: true,
        answer: { answer: "Test answer.", language: "EN", route: "general", confidence: "high", evidenceStatus: "sufficient", citations: [], usedFinancialFactKeys: [], warnings: [], provider: "gemini" },
        route: "general",
        unavailableSources: [],
        warnings: [],
      }),
      { status: 200 },
    )) as typeof fetch;

  try {
    const result = await sendChatMessage({ question: "What is RAG?", selectedContractType: "other", answerLanguage: "EN" }, "en");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.route, "general");
      assert.equal(result.answer.answer, "Test answer.");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("PASS sendChatMessage resolves a successful response");
}

async function testSendChatMessageServerError(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: false, error: { code: "PROVIDER_RATE_LIMITED", message: "Busy, try again.", retryable: true } }), {
      status: 429,
    })) as typeof fetch;

  try {
    const result = await sendChatMessage({ question: "hi", selectedContractType: "other", answerLanguage: "EN" }, "en");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "PROVIDER_RATE_LIMITED");
      assert.equal(result.message, "Busy, try again.");
      assert.equal(result.retryable, true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("PASS sendChatMessage surfaces the server's own sanitized error, never a raw exception");
}

async function testSendChatMessageNetworkFailureNeverLeaksRawError(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED 127.0.0.1:5432 — raw internal detail that must never reach the UI");
  }) as typeof fetch;

  try {
    const result = await sendChatMessage({ question: "hi", selectedContractType: "other", answerLanguage: "EN" }, "en");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(!result.message.includes("ECONNREFUSED"), "a raw network/server error message must never be surfaced to the user");
      assert.equal(result.retryable, true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("PASS a network failure never leaks the raw underlying error message");
}

async function testSendChatMessageMalformedResponse(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("not json at all", { status: 200 })) as typeof fetch;

  try {
    const result = await sendChatMessage({ question: "hi", selectedContractType: "other", answerLanguage: "AR" }, "ar");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "INTERNAL_ERROR");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("PASS a malformed (non-JSON) response is treated as a safe internal error, never crashes");
}

export async function run(): Promise<void> {
  testBuildChatRequestPayloadOnlyAllowedFields();
  testBuildChatRequestPayloadOmitsAbsentOptionalFields();
  testQuestionValidationHelpers();
  testCanSendQuestion();
  await testSendChatMessageSuccess();
  await testSendChatMessageServerError();
  await testSendChatMessageNetworkFailureNeverLeaksRawError();
  await testSendChatMessageMalformedResponse();

  console.log("PASS chatApi.test.ts");
}

run();
