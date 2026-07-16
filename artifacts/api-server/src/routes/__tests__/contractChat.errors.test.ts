import assert from "node:assert/strict";
import { handleContractChat } from "../contractChat";
import {
  createMockReq,
  createMockRes,
  fullyMockedDeps,
  makeMalformedProvider,
  makeSlowProvider,
  providerRequestFailedError,
  rateLimitedError,
} from "./contractChatTestFixtures";

const GENERAL_BODY = {
  question: "What is RAG?",
  selectedContractType: "auto_finance" as const,
  answerLanguage: "EN" as const,
};

export async function run(): Promise<void> {
  // --- Provider rate limit maps to PROVIDER_RATE_LIMITED, and the fallback provider is used instead ---
  {
    const { req } = createMockReq(GENERAL_BODY);
    const res = createMockRes();
    const primary = { async generate(): Promise<never> { throw rateLimitedError(); } };
    await handleContractChat(req, res, fullyMockedDeps({ composeAnswerOptions: { provider: primary } }));
    // The fallback (mocked, honest) provider succeeds, so this is NOT an error response —
    // it demonstrates the rate-limit path is handled by falling over, not by failing the request.
    assert.equal(res.statusCode, 200);
  }
  console.log("PASS a rate-limited primary provider falls back transparently to the secondary provider");

  // --- Both providers rate-limited/failing: PROVIDER_RATE_LIMITED is surfaced to the client ---
  {
    const { req } = createMockReq(GENERAL_BODY);
    const res = createMockRes();
    const alwaysRateLimited = { async generate(): Promise<never> { throw rateLimitedError(); } };
    await handleContractChat(req, res, fullyMockedDeps({ composeAnswerOptions: { provider: alwaysRateLimited, fallbackProvider: alwaysRateLimited } }));
    assert.equal(res.statusCode, 429);
    const body = res.body as { success: false; error: { code: string; retryable: boolean } };
    assert.equal(body.error.code, "PROVIDER_RATE_LIMITED");
    assert.equal(body.error.retryable, true);
  }
  console.log("PASS both providers rate-limited maps to 429 PROVIDER_RATE_LIMITED, marked retryable");

  // --- Provider unavailable (non-rate-limit failure) maps to PROVIDER_UNAVAILABLE ---
  {
    const { req } = createMockReq(GENERAL_BODY);
    const res = createMockRes();
    const failingProvider = { async generate(): Promise<never> { throw providerRequestFailedError(); } };
    await handleContractChat(req, res, fullyMockedDeps({ composeAnswerOptions: { provider: failingProvider } }));
    assert.equal(res.statusCode, 422);
    const body = res.body as { success: false; error: { code: string; retryable: boolean } };
    assert.equal(body.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(body.error.retryable, true);
  }
  console.log("PASS a non-rate-limit provider failure maps to 422 PROVIDER_UNAVAILABLE");

  // --- Composer schema failure (both attempts return unparsable JSON) maps to ANSWER_GENERATION_FAILED ---
  {
    const { req } = createMockReq(GENERAL_BODY);
    const res = createMockRes();
    const malformed = makeMalformedProvider();
    await handleContractChat(req, res, fullyMockedDeps({ composeAnswerOptions: { provider: malformed, fallbackProvider: malformed } }));
    assert.equal(res.statusCode, 422);
    const body = res.body as { success: false; error: { code: string } };
    assert.equal(body.error.code, "ANSWER_GENERATION_FAILED");
  }
  console.log("PASS both provider attempts returning malformed JSON maps to 422 ANSWER_GENERATION_FAILED");

  // --- Timeout ---
  {
    const { req } = createMockReq(GENERAL_BODY);
    const res = createMockRes();
    const slow = makeSlowProvider(200);
    await handleContractChat(req, res, fullyMockedDeps({ composeAnswerOptions: { provider: slow, fallbackProvider: slow }, timeoutMs: 10 }));
    assert.equal(res.statusCode, 504);
    const body = res.body as { success: false; error: { code: string; retryable: boolean } };
    assert.equal(body.error.code, "REQUEST_TIMEOUT");
    assert.equal(body.error.retryable, true);
  }
  console.log("PASS a slow pipeline exceeding the configured timeout maps to 504 REQUEST_TIMEOUT");

  // --- Unexpected internal failure (an error type nothing recognizes) maps to INTERNAL_ERROR ---
  {
    const { req } = createMockReq(GENERAL_BODY);
    const res = createMockRes();
    const weirdFailure = { async generate(): Promise<never> { throw new Error("something totally unexpected"); } };
    await handleContractChat(req, res, fullyMockedDeps({ composeAnswerOptions: { provider: weirdFailure } }));
    assert.equal(res.statusCode, 500);
    const body = res.body as { success: false; error: { code: string; retryable: boolean } };
    assert.equal(body.error.code, "INTERNAL_ERROR");
    assert.equal(body.error.retryable, false);
    assert.ok(!JSON.stringify(body).includes("something totally unexpected"), "the raw error message must never reach the client");
  }
  console.log("PASS an unrecognized error type maps to 500 INTERNAL_ERROR without leaking the original message");

  console.log("PASS contractChat.errors.test.ts");
}

run();
