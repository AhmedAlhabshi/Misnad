import assert from "node:assert/strict";
import { GeminiKeyPool } from "@workspace/gemini-key-pool";
import { ContractAnalysisError } from "../errors";
import {
  runGeminiGenerateWithPool,
  type GeminiPoolGenerateClient,
} from "../providers/geminiProvider";
import type { ContractAnalysisProviderRequest } from "../providers/types";

const BASE_REQUEST: ContractAnalysisProviderRequest = {
  systemInstructions: "sys",
  userPrompt: "prompt",
  context: "testContext",
};

function rateLimitError(): Error {
  return new Error("429 RESOURCE_EXHAUSTED: quota exceeded for this project");
}

function authError(): Error {
  return Object.assign(new Error("API key not valid. Please pass a valid API key."), { status: 401 });
}

function badRequestError(): Error {
  return new Error("400 INVALID_ARGUMENT: the request body is malformed");
}

function unavailableError(): Error {
  return Object.assign(
    new Error('{"error":{"code":503,"message":"The model is overloaded due to high demand. Please try again later.","status":"UNAVAILABLE"}}'),
    { status: 503 },
  );
}

function timeoutError(): Error {
  return Object.assign(new Error("The operation timed out."), { code: "ETIMEDOUT" });
}

/**
 * Builds a fake per-key client factory from an ordered map of key id ->
 * queue of behaviors. `"hang"` returns a promise that never resolves —
 * used to prove the per-key `attemptTimeoutMs` abandons a stuck key rather
 * than waiting for it, without an actual real-time sleep in the test.
 */
function fakeClientFactory(behaviors: Record<string, Array<"success" | "hang" | Error>>): {
  getClient: (keyState: { id: string; key: string }) => GeminiPoolGenerateClient;
  callCounts: Record<string, number>;
} {
  const callCounts: Record<string, number> = {};
  const getClient = (keyState: { id: string }): GeminiPoolGenerateClient => ({
    models: {
      generateContent: async () => {
        callCounts[keyState.id] = (callCounts[keyState.id] ?? 0) + 1;
        const queue = behaviors[keyState.id] ?? [];
        const next = queue.shift();
        if (next === "hang") {
          return new Promise(() => {});
        }
        if (next instanceof Error) throw next;
        return { text: '{"ok":true}', candidates: [{ finishReason: "STOP" }], usageMetadata: {} };
      },
    },
  });
  return { getClient, callCounts };
}

export async function run(): Promise<void> {
  // --- key 1 rate-limited, key 2 succeeds ------------------------------------
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: [rateLimitError()],
      gemini_key_2: ["success"],
    });

    const response = await runGeminiGenerateWithPool(BASE_REQUEST, {
      pool,
      model: "gemini-2.5-flash",
      getClient,
    });

    assert.equal(response.rawText, '{"ok":true}');
    assert.equal(callCounts.gemini_key_1, 1, "key 1 attempted exactly once");
    assert.equal(callCounts.gemini_key_2, 1, "key 2 attempted exactly once");
    assert.deepEqual(pool.getEligibleKeysInOrder().map((k) => k.id), ["gemini_key_2"], "key 1 is now cooling down");
  }
  console.log("PASS key 1 rate-limited, key 2 succeeds — key 1 goes into cooldown, key 2 is not retried needlessly");

  // --- key 1 and key 2 rate-limited -> pool exhausted, RATE_LIMITED thrown -----
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: [rateLimitError()],
      gemini_key_2: [rateLimitError()],
    });

    await assert.rejects(
      () => runGeminiGenerateWithPool(BASE_REQUEST, { pool, model: "gemini-2.5-flash", getClient }),
      (error: unknown) => error instanceof ContractAnalysisError && error.code === "RATE_LIMITED",
    );
    assert.equal(callCounts.gemini_key_1, 1);
    assert.equal(callCounts.gemini_key_2, 1);
    assert.deepEqual(pool.getEligibleKeysInOrder(), [], "both keys are now cooling down");
  }
  console.log("PASS key 1 and key 2 both rate-limited: pool exhausted, RATE_LIMITED thrown exactly once each key is tried (this is what triggers the existing OpenRouter fallback in service.ts/composer.ts, unchanged)");

  // --- HTTP 400 does not rotate: fails immediately, second key never touched --
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: [badRequestError()],
      gemini_key_2: ["success"],
    });

    await assert.rejects(
      () => runGeminiGenerateWithPool(BASE_REQUEST, { pool, model: "gemini-2.5-flash", getClient }),
      (error: unknown) => error instanceof ContractAnalysisError && error.code === "PROVIDER_REQUEST_FAILED",
    );
    assert.equal(callCounts.gemini_key_1, 1);
    assert.equal(callCounts.gemini_key_2 ?? 0, 0, "key 2 must never be attempted for a non-retryable request error");
    assert.deepEqual(
      pool.getEligibleKeysInOrder().map((k) => k.id),
      ["gemini_key_1", "gemini_key_2"],
      "a bad-request failure never places any key in cooldown",
    );
  }
  console.log("PASS a malformed/bad request (HTTP 400) never rotates to another key and never starts a cooldown");

  // --- an empty/unusable response never rotates either (not a request error) --
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const callCounts: Record<string, number> = {};
    const getClient = (keyState: { id: string }): GeminiPoolGenerateClient => ({
      models: {
        generateContent: async () => {
          callCounts[keyState.id] = (callCounts[keyState.id] ?? 0) + 1;
          return { text: "   " };
        },
      },
    });

    await assert.rejects(
      () => runGeminiGenerateWithPool(BASE_REQUEST, { pool, model: "gemini-2.5-flash", getClient }),
      (error: unknown) => error instanceof ContractAnalysisError && error.code === "NO_USABLE_RESPONSE",
    );
    assert.equal(callCounts.gemini_key_1, 1);
    assert.equal(callCounts.gemini_key_2 ?? 0, 0, "an empty response is a content problem, never a reason to try another key");
  }
  console.log("PASS an empty/unusable provider response never rotates to another key");

  // --- 401/403 rotates to the next key, but never twice on the same key --------
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: [authError()],
      gemini_key_2: ["success"],
    });

    const response = await runGeminiGenerateWithPool(BASE_REQUEST, { pool, model: "gemini-2.5-flash", getClient });
    assert.equal(response.rawText, '{"ok":true}');
    assert.equal(callCounts.gemini_key_1, 1);
    assert.equal(callCounts.gemini_key_2, 1);
    // Auth failures are not rate-limit cooldowns — key 1 is not placed in cooldown,
    // it's simply skipped for the remainder of *this* request (each key is only
    // ever attempted once per request regardless of the reason).
    assert.deepEqual(
      pool.getEligibleKeysInOrder().map((k) => k.id),
      ["gemini_key_1", "gemini_key_2"],
      "an auth failure does not start a rate-limit cooldown",
    );
  }
  console.log("PASS a 401/403 on one key rotates to the next configured key without cooling it down");

  // --- every key failing on auth (no rate limiting at all) -> PROVIDER_REQUEST_FAILED, not RATE_LIMITED ---
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const { getClient } = fakeClientFactory({
      gemini_key_1: [authError()],
      gemini_key_2: [authError()],
    });

    await assert.rejects(
      () => runGeminiGenerateWithPool(BASE_REQUEST, { pool, model: "gemini-2.5-flash", getClient }),
      (error: unknown) => error instanceof ContractAnalysisError && error.code === "PROVIDER_REQUEST_FAILED",
    );
  }
  console.log("PASS every key failing only on auth (never rate-limited) throws PROVIDER_REQUEST_FAILED, never RATE_LIMITED — never used to silently bypass an authentication problem");

  // --- key 1 returns 503 (temporarily unavailable/high demand), key 2 succeeds ---
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: [unavailableError()],
      gemini_key_2: ["success"],
    });

    const response = await runGeminiGenerateWithPool(BASE_REQUEST, { pool, model: "gemini-flash-latest", getClient });

    assert.equal(response.rawText, '{"ok":true}');
    assert.equal(callCounts.gemini_key_1, 1, "key 1 attempted exactly once");
    assert.equal(callCounts.gemini_key_2, 1, "key 2 attempted exactly once, immediately, no sleep");
    assert.deepEqual(
      pool.getEligibleKeysInOrder().map((k) => k.id),
      ["gemini_key_2"],
      "key 1 is placed in cooldown after a 503/UNAVAILABLE/high-demand failure",
    );
  }
  console.log("PASS key 1 returns 503 (high demand/UNAVAILABLE), key 2 succeeds — key 1 cools down, no rotation delay");

  // --- key 1 times out, key 2 succeeds --------------------------------------
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: [timeoutError()],
      gemini_key_2: ["success"],
    });

    const response = await runGeminiGenerateWithPool(BASE_REQUEST, { pool, model: "gemini-flash-latest", getClient });

    assert.equal(response.rawText, '{"ok":true}');
    assert.equal(callCounts.gemini_key_1, 1);
    assert.equal(callCounts.gemini_key_2, 1);
    assert.deepEqual(
      pool.getEligibleKeysInOrder().map((k) => k.id),
      ["gemini_key_2"],
      "a provider request timeout also places the key in cooldown and rotates",
    );
  }
  console.log("PASS key 1 times out, key 2 succeeds — timeout is treated as a rotatable temporary failure");

  // --- all keys return 503 -> pool exhausted, RATE_LIMITED triggers the existing OpenRouter fallback ---
  {
    const pool = new GeminiKeyPool(["k1", "k2", "k3"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: [unavailableError()],
      gemini_key_2: [unavailableError()],
      gemini_key_3: [unavailableError()],
    });

    await assert.rejects(
      () => runGeminiGenerateWithPool(BASE_REQUEST, { pool, model: "gemini-flash-latest", getClient }),
      (error: unknown) => error instanceof ContractAnalysisError && error.code === "RATE_LIMITED",
    );
    assert.equal(callCounts.gemini_key_1, 1);
    assert.equal(callCounts.gemini_key_2, 1);
    assert.equal(callCounts.gemini_key_3, 1);
    assert.deepEqual(pool.getEligibleKeysInOrder(), [], "every key is now cooling down");
  }
  console.log("PASS every key returning 503 exhausts the pool and throws RATE_LIMITED — triggers the existing, unchanged OpenRouter fallback");

  // --- diagnostics for a 503/timeout rotation never include a key value ------
  {
    const pool = new GeminiKeyPool(["a-real-looking-secret-key-value"], 120);
    const { getClient } = fakeClientFactory({ gemini_key_1: [unavailableError()] });

    const originalError = console.error;
    let logged = "";
    console.error = (...args: unknown[]) => {
      logged += args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    };
    try {
      await assert.rejects(() => runGeminiGenerateWithPool(BASE_REQUEST, { pool, model: "gemini-flash-latest", getClient }));
    } finally {
      console.error = originalError;
    }
    assert.ok(!logged.includes("a-real-looking-secret-key-value"), "no diagnostic line may ever contain a raw key value");
    assert.ok(logged.includes("gemini_key_1"));
    assert.ok(logged.includes("TEMPORARILY_UNAVAILABLE"));
  }
  console.log("PASS diagnostics for a 503/temporarily-unavailable rotation contain only safe ids and reasons, never a key value");

  // --- no key attempted more than once per request, even across a longer pool --
  {
    const pool = new GeminiKeyPool(["k1", "k2", "k3"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: [rateLimitError()],
      gemini_key_2: [authError()],
      gemini_key_3: ["success"],
    });

    const response = await runGeminiGenerateWithPool(BASE_REQUEST, { pool, model: "gemini-2.5-flash", getClient });
    assert.equal(response.rawText, '{"ok":true}');
    assert.equal(callCounts.gemini_key_1, 1);
    assert.equal(callCounts.gemini_key_2, 1);
    assert.equal(callCounts.gemini_key_3, 1);
  }
  console.log("PASS a mixed rate-limit-then-auth-then-success chain attempts each key exactly once, in order");

  // --- diagnostics never include a key value, only safe ids/reasons/context ----
  {
    const pool = new GeminiKeyPool(["a-real-looking-secret-key-value"], 120);
    const { getClient } = fakeClientFactory({ gemini_key_1: [rateLimitError()] });

    const originalError = console.error;
    let logged = "";
    console.error = (...args: unknown[]) => {
      logged += args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    };
    try {
      await assert.rejects(() => runGeminiGenerateWithPool(BASE_REQUEST, { pool, model: "gemini-2.5-flash", getClient }));
    } finally {
      console.error = originalError;
    }
    assert.ok(!logged.includes("a-real-looking-secret-key-value"), "no diagnostic line may ever contain a raw key value");
    assert.ok(logged.includes("gemini_key_1"));
    assert.ok(logged.includes("testContext"));
  }
  console.log("PASS diagnostics emitted during rotation/exhaustion contain only safe ids and context, never a key value");

  // --- key 1 hangs past its attempt timeout, key 2 succeeds ------------------
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: ["hang"],
      gemini_key_2: ["success"],
    });

    const startedAt = Date.now();
    const response = await runGeminiGenerateWithPool(BASE_REQUEST, {
      pool,
      model: "gemini-flash-latest",
      getClient,
      attemptTimeoutMs: 20,
    });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(response.rawText, '{"ok":true}');
    assert.equal(callCounts.gemini_key_1, 1, "key 1 attempted exactly once");
    assert.equal(callCounts.gemini_key_2, 1, "key 2 attempted exactly once");
    assert.ok(elapsedMs < 500, `key 1's hang must be abandoned at the attempt timeout, not waited out (took ${elapsedMs}ms)`);
    assert.deepEqual(
      pool.getEligibleKeysInOrder().map((k) => k.id),
      ["gemini_key_2"],
      "key 1 is placed in cooldown after its attempt timed out",
    );
  }
  console.log("PASS key 1 hangs past its attempt timeout, key 2 succeeds immediately — no waiting for a real response from key 1");

  // --- key 1 and key 2 both hang, key 3 succeeds ------------------------------
  {
    const pool = new GeminiKeyPool(["k1", "k2", "k3"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: ["hang"],
      gemini_key_2: ["hang"],
      gemini_key_3: ["success"],
    });

    const startedAt = Date.now();
    const response = await runGeminiGenerateWithPool(BASE_REQUEST, {
      pool,
      model: "gemini-flash-latest",
      getClient,
      attemptTimeoutMs: 20,
    });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(response.rawText, '{"ok":true}');
    assert.equal(callCounts.gemini_key_1, 1);
    assert.equal(callCounts.gemini_key_2, 1);
    assert.equal(callCounts.gemini_key_3, 1);
    assert.ok(elapsedMs < 1000, `two hung keys must both be abandoned at their attempt timeout (took ${elapsedMs}ms)`);
    assert.deepEqual(
      pool.getEligibleKeysInOrder().map((k) => k.id),
      ["gemini_key_3"],
      "keys 1 and 2 are both in cooldown after timing out",
    );
  }
  console.log("PASS key 1 and key 2 both hang past the attempt timeout, key 3 succeeds — each abandoned key rotates immediately");

  // --- every key hangs -> pool exhausted, RATE_LIMITED triggers the existing OpenRouter fallback, bounded total duration ---
  {
    const pool = new GeminiKeyPool(["k1", "k2", "k3"], 120);
    const { getClient, callCounts } = fakeClientFactory({
      gemini_key_1: ["hang"],
      gemini_key_2: ["hang"],
      gemini_key_3: ["hang"],
    });

    const startedAt = Date.now();
    await assert.rejects(
      () => runGeminiGenerateWithPool(BASE_REQUEST, { pool, model: "gemini-flash-latest", getClient, attemptTimeoutMs: 20 }),
      (error: unknown) => error instanceof ContractAnalysisError && error.code === "RATE_LIMITED",
    );
    const elapsedMs = Date.now() - startedAt;

    assert.equal(callCounts.gemini_key_1, 1);
    assert.equal(callCounts.gemini_key_2, 1);
    assert.equal(callCounts.gemini_key_3, 1);
    assert.deepEqual(pool.getEligibleKeysInOrder(), [], "every key is now cooling down");
    // Total time must stay close to keys * attemptTimeoutMs (bounded), never
    // anywhere near "hang forever" — this is the whole point of the per-key
    // timeout: rotation never waits for the full route timeout.
    assert.ok(elapsedMs < 1000, `total duration across all 3 hung keys must stay bounded (took ${elapsedMs}ms)`);
  }
  console.log(
    "PASS every key hangs past its attempt timeout: pool exhausted, RATE_LIMITED thrown, total duration stays bounded — never waits indefinitely",
  );

  // --- diagnostics for a timed-out attempt use PROVIDER_TIMEOUT and never include a key value ---
  {
    const pool = new GeminiKeyPool(["a-real-looking-secret-key-value"], 120);
    const { getClient } = fakeClientFactory({ gemini_key_1: ["hang"] });

    const originalError = console.error;
    let logged = "";
    console.error = (...args: unknown[]) => {
      logged += args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    };
    try {
      await assert.rejects(() =>
        runGeminiGenerateWithPool(BASE_REQUEST, { pool, model: "gemini-flash-latest", getClient, attemptTimeoutMs: 20 }),
      );
    } finally {
      console.error = originalError;
    }
    assert.ok(!logged.includes("a-real-looking-secret-key-value"), "no diagnostic line may ever contain a raw key value");
    assert.ok(logged.includes("gemini_key_1"));
    assert.ok(logged.includes("PROVIDER_TIMEOUT"));
    assert.ok(logged.includes("gemini_key_attempt_timed_out"));
    assert.ok(logged.includes("gemini_pool_operation_completed"));
  }
  console.log("PASS diagnostics for a timed-out attempt use the PROVIDER_TIMEOUT reason and never include a key value");

  console.log("PASS geminiProvider.keyPool.test.ts");
}

run();
