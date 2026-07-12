import assert from "node:assert/strict";
import { openRouterContractAnalysisProvider } from "../providers/openRouterProvider";
import { ContractAnalysisError } from "../errors";

interface MockedEnv {
  capturedLogs: unknown[][];
  sleepCalls: number[];
  fetchCallCount: () => number;
}

async function withMockedEnvironment<T>(
  responses: (() => globalThis.Response)[],
  run: (env: MockedEnv) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalConsoleError = console.error;
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  const capturedLogs: unknown[][] = [];
  const sleepCalls: number[] = [];
  let callIndex = 0;

  console.error = (...args: unknown[]) => {
    capturedLogs.push(args);
  };

  globalThis.fetch = (async () => {
    const response = responses[callIndex]?.();
    callIndex += 1;
    if (!response) {
      throw new Error("test error: fetch called more times than expected responses were provided");
    }
    return response;
  }) as typeof fetch;

  // Fire the callback immediately instead of actually waiting, so tests stay
  // fast, while still recording the requested delay for assertions.
  globalThis.setTimeout = ((cb: (...args: unknown[]) => void, ms?: number) => {
    sleepCalls.push(ms ?? 0);
    cb();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  process.env.OPENROUTER_API_KEY = "test-key-for-rate-limit-retry-tests";

  try {
    return await run({ capturedLogs, sleepCalls, fetchCallCount: () => callIndex });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    console.error = originalConsoleError;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  }
}

const VALID_SUCCESS_BODY = JSON.stringify({
  choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});

function rateLimitedResponse(retryAfter: string | null): Response {
  return new Response(JSON.stringify({ error: { code: "rate_limited", message: "slow down" } }), {
    status: 429,
    headers: retryAfter !== null ? { "retry-after": retryAfter } : undefined,
  });
}

async function testSuccessAfterOneRetry(): Promise<void> {
  await withMockedEnvironment(
    [() => rateLimitedResponse("3"), () => new Response(VALID_SUCCESS_BODY, { status: 200 })],
    async (env) => {
      const result = await openRouterContractAnalysisProvider.generate({
        systemInstructions: "sys",
        userPrompt: "prompt",
      });

      assert.equal(env.fetchCallCount(), 2, "fetch must be called exactly twice");
      assert.deepEqual(env.sleepCalls, [3000], "must wait exactly once, for 3000ms (retry-after: 3)");
      assert.equal(result.rawText, '{"ok":true}', "the second (successful) response must be returned");

      const retryLog = env.capturedLogs.find(
        (args) => (args[1] as Record<string, unknown> | undefined)?.event === "openrouter_rate_limit_retry",
      );
      assert.ok(retryLog, "a retry diagnostic must be logged");
      const [label, payload] = retryLog as [string, Record<string, unknown>];
      assert.equal(label, "[MISNAD_DIAGNOSTIC]");
      assert.equal(payload.provider, "openrouter");
      assert.equal(payload.retryAfterSeconds, 3);
      assert.equal(payload.retryAttempt, 1);

      console.log("PASS testSuccessAfterOneRetry");
    },
  );
}

async function testBothAttemptsRateLimitedStillThrows(): Promise<void> {
  await withMockedEnvironment(
    [() => rateLimitedResponse("2"), () => rateLimitedResponse("2")],
    async (env) => {
      let thrown: unknown;
      try {
        await openRouterContractAnalysisProvider.generate({
          systemInstructions: "sys",
          userPrompt: "prompt",
        });
      } catch (err) {
        thrown = err;
      }

      assert.equal(env.fetchCallCount(), 2, "fetch must be called exactly twice (initial + one retry, no more)");
      assert.deepEqual(env.sleepCalls, [2000], "must still wait only once, even though both attempts failed");
      assert.ok(
        thrown instanceof ContractAnalysisError && thrown.code === "RATE_LIMITED",
        "the existing RATE_LIMITED error must still be thrown after the retry also fails",
      );

      console.log("PASS testBothAttemptsRateLimitedStillThrows");
    },
  );
}

async function testNonRateLimitFailureDoesNotRetry(): Promise<void> {
  await withMockedEnvironment([() => new Response("server error", { status: 500 })], async (env) => {
    let thrown: unknown;
    try {
      await openRouterContractAnalysisProvider.generate({
        systemInstructions: "sys",
        userPrompt: "prompt",
      });
    } catch (err) {
      thrown = err;
    }

    assert.equal(env.fetchCallCount(), 1, "fetch must be called exactly once for a non-429 failure");
    assert.deepEqual(env.sleepCalls, [], "no wait/retry must happen for a non-429 failure");
    assert.ok(
      thrown instanceof ContractAnalysisError && thrown.code === "PROVIDER_REQUEST_FAILED",
      "the existing PROVIDER_REQUEST_FAILED error must still be thrown, unchanged",
    );

    console.log("PASS testNonRateLimitFailureDoesNotRetry");
  });
}

async function testRetryAfterIsCappedAtFiveSeconds(): Promise<void> {
  await withMockedEnvironment(
    [() => rateLimitedResponse("20"), () => rateLimitedResponse("20")],
    async (env) => {
      let thrown: unknown;
      try {
        await openRouterContractAnalysisProvider.generate({
          systemInstructions: "sys",
          userPrompt: "prompt",
        });
      } catch (err) {
        thrown = err;
      }

      assert.deepEqual(
        env.sleepCalls,
        [5000],
        "a retry-after of 20 seconds must be capped to the 5-second maximum",
      );
      assert.ok(thrown instanceof ContractAnalysisError && thrown.code === "RATE_LIMITED");

      console.log("PASS testRetryAfterIsCappedAtFiveSeconds");
    },
  );
}

async function testMissingRetryAfterUsesThreeSecondDefault(): Promise<void> {
  await withMockedEnvironment(
    [() => rateLimitedResponse(null), () => rateLimitedResponse(null)],
    async (env) => {
      try {
        await openRouterContractAnalysisProvider.generate({
          systemInstructions: "sys",
          userPrompt: "prompt",
        });
      } catch {
        // expected
      }

      assert.deepEqual(
        env.sleepCalls,
        [3000],
        "a missing retry-after header must default to 3 seconds",
      );

      console.log("PASS testMissingRetryAfterUsesThreeSecondDefault");
    },
  );
}

export async function run(): Promise<void> {
  await testSuccessAfterOneRetry();
  await testBothAttemptsRateLimitedStillThrows();
  await testNonRateLimitFailureDoesNotRetry();
  await testRetryAfterIsCappedAtFiveSeconds();
  await testMissingRetryAfterUsesThreeSecondDefault();

  console.log("PASS openRouterProvider.rateLimitRetry.test.ts");
}

run();
