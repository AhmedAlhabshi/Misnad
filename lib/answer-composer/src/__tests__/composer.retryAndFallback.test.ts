import assert from "node:assert/strict";
import { ContractAnalysisError } from "@workspace/contract-analysis";
import { composeAnswer } from "../composer";
import { ComposerError } from "../errors";
import { buildGroundedContextFixture, makeQueueProvider, providerRequestFailed, rateLimited, validLlmResponseTextFor } from "./testFixtures";

export async function run(): Promise<void> {
  // --- Malformed JSON on the first attempt triggers a correction retry that succeeds ---
  {
    const context = buildGroundedContextFixture("contract");
    const provider = makeQueueProvider([{ rawText: "this is not json at all" }, { rawText: validLlmResponseTextFor(context) }]);
    const result = await composeAnswer(context, { provider, providerName: "mock" });
    assert.equal(result.citations.length, 1);
  }
  console.log("PASS malformed JSON on the first attempt is corrected by the retry attempt");

  // --- A schema-invalid (but syntactically valid) JSON response also triggers correction ---
  {
    const context = buildGroundedContextFixture("contract");
    const provider = makeQueueProvider([
      { rawText: JSON.stringify({ notTheRightShape: true }) },
      { rawText: validLlmResponseTextFor(context) },
    ]);
    const result = await composeAnswer(context, { provider, providerName: "mock" });
    assert.equal(result.citations.length, 1);
  }
  console.log("PASS a schema-invalid JSON response on the first attempt is corrected by the retry attempt");

  // --- Both attempts failing throws a typed ComposerError, never an unhandled/generic error ---
  {
    const context = buildGroundedContextFixture("contract");
    const provider = makeQueueProvider([{ rawText: "still not json" }, { rawText: "still not json either" }]);
    await assert.rejects(
      () => composeAnswer(context, { provider, providerName: "mock" }),
      (error: unknown) => {
        assert.ok(error instanceof ComposerError);
        assert.equal(error.code, "SCHEMA_VALIDATION_FAILED");
        return true;
      },
    );
  }
  console.log("PASS both attempts failing schema validation throws a typed ComposerError");

  // --- A RATE_LIMITED error from the primary provider triggers fallback to the secondary provider ---
  {
    const context = buildGroundedContextFixture("legal");
    const primary = makeQueueProvider([{ throwError: rateLimited() }]);
    const fallback = makeQueueProvider([{ rawText: validLlmResponseTextFor(context) }]);
    const result = await composeAnswer(context, {
      provider: primary,
      providerName: "mock-primary",
      fallbackProvider: fallback,
      fallbackProviderName: "mock-fallback",
    });
    assert.equal(result.provider, "mock-fallback", "the result must report the fallback provider actually served the request");
    assert.equal(result.citations.length, 1);
  }
  console.log("PASS a RATE_LIMITED primary provider error triggers fallback to the secondary provider");

  // --- A non-rate-limit provider error never triggers fallback — it propagates directly ---
  {
    const context = buildGroundedContextFixture("contract");
    const primary = makeQueueProvider([{ throwError: providerRequestFailed() }]);
    const fallback = makeQueueProvider([{ rawText: validLlmResponseTextFor(context) }]);
    await assert.rejects(
      () => composeAnswer(context, { provider: primary, fallbackProvider: fallback }),
      (error: unknown) => {
        assert.ok(error instanceof ContractAnalysisError);
        assert.equal(error.code, "PROVIDER_REQUEST_FAILED");
        return true;
      },
    );
  }
  console.log("PASS a non-rate-limit provider error propagates directly, never triggering fallback");

  // --- Both the primary and the fallback provider failing (rate-limited, then also failing) propagates the fallback's error ---
  {
    const context = buildGroundedContextFixture("contract");
    const primary = makeQueueProvider([{ throwError: rateLimited() }]);
    const fallback = makeQueueProvider([{ throwError: providerRequestFailed() }]);
    await assert.rejects(
      () => composeAnswer(context, { provider: primary, fallbackProvider: fallback }),
      (error: unknown) => {
        assert.ok(error instanceof ContractAnalysisError);
        assert.equal(error.code, "PROVIDER_REQUEST_FAILED");
        return true;
      },
    );
  }
  console.log("PASS both providers failing (rate-limited primary, failing fallback) propagates the fallback's own error");

  console.log("PASS composer.retryAndFallback.test.ts");
}

run();
