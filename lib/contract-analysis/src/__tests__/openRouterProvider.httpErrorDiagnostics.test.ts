import assert from "node:assert/strict";
import { openRouterContractAnalysisProvider } from "../providers/openRouterProvider";
import { ContractAnalysisError } from "../errors";

const SENSITIVE_API_KEY = "sk-or-v1-totally-secret-test-key";
const SENSITIVE_USER_PROMPT_MARKER = "MISNAD_SENSITIVE_USER_PROMPT_MARKER_998877";

function withMockedFetchAndConsole<T>(
  mockResponse: () => globalThis.Response,
  run: (capturedLogs: unknown[][]) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalConsoleError = console.error;
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  const capturedLogs: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    capturedLogs.push(args);
  };
  globalThis.fetch = (async () => mockResponse()) as typeof fetch;
  // A persistent 429 mock now triggers the one-retry-then-fail path (see
  // openRouterProvider.rateLimitRetry.test.ts) — fire the wait immediately
  // instead of actually waiting, so this test file stays fast.
  globalThis.setTimeout = ((cb: (...args: unknown[]) => void) => {
    cb();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  process.env.OPENROUTER_API_KEY = SENSITIVE_API_KEY;

  return run(capturedLogs).finally(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    console.error = originalConsoleError;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  });
}

async function testJsonRateLimitErrorLogsSafeDiagnostic(): Promise<void> {
  const errorBody = JSON.stringify({
    error: {
      code: "rate_limit_exceeded",
      type: "rate_limit",
      message: "You exceeded your current quota, please check your plan.",
    },
  });

  await withMockedFetchAndConsole(
    () =>
      new Response(errorBody, {
        status: 429,
        headers: {
          "retry-after": "30",
          "x-ratelimit-limit": "20",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1712345678",
        },
      }),
    async (capturedLogs) => {
      let thrown: unknown;
      try {
        await openRouterContractAnalysisProvider.generate({
          systemInstructions: "sys",
          userPrompt: `analyze this ${SENSITIVE_USER_PROMPT_MARKER}`,
        });
      } catch (err) {
        thrown = err;
      }

      assert.ok(
        thrown instanceof ContractAnalysisError && thrown.code === "RATE_LIMITED",
        "the existing RATE_LIMITED error must still be thrown unchanged",
      );

      // A persistent 429 now also triggers one transport-level retry before
      // finally failing (see openRouterProvider.rateLimitRetry.test.ts for
      // that behavior in isolation) — so two diagnostics are logged here:
      // the retry attempt, then the final http-error diagnostic below.
      assert.equal(capturedLogs.length, 2, "the retry diagnostic plus the final http-error diagnostic must be emitted");
      const httpErrorLog = capturedLogs.find(
        (args) => (args[1] as Record<string, unknown> | undefined)?.event === "openrouter_http_error",
      );
      assert.ok(httpErrorLog, "the openrouter_http_error diagnostic must still be logged");
      const [label, payload] = httpErrorLog as [string, Record<string, unknown>];
      assert.equal(label, "[MISNAD_DIAGNOSTIC]");
      assert.equal(payload.event, "openrouter_http_error");
      assert.equal(payload.provider, "openrouter");
      assert.equal(payload.model, "qwen/qwen3-next-80b-a3b-instruct:free");
      assert.equal(payload.httpStatus, 429);
      assert.equal(payload.errorCode, "rate_limit_exceeded");
      assert.equal(payload.errorType, "rate_limit");
      assert.equal(payload.errorMessage, "You exceeded your current quota, please check your plan.");
      assert.equal(payload.retryAfter, "30");
      assert.equal(payload.rateLimitLimit, "20");
      assert.equal(payload.rateLimitRemaining, "0");
      assert.equal(payload.rateLimitReset, "1712345678");

      const serialized = JSON.stringify(capturedLogs);
      assert.equal(serialized.includes(SENSITIVE_API_KEY), false, "the API key must never be logged");
      assert.equal(serialized.includes("Bearer"), false, "the Authorization header must never be logged");
      assert.equal(
        serialized.includes(SENSITIVE_USER_PROMPT_MARKER),
        false,
        "the user prompt content must never be logged",
      );

      console.log("PASS testJsonRateLimitErrorLogsSafeDiagnostic");
    },
  );
}

async function testMalformedBodyLogsTruncatedPreviewAndStillThrows(): Promise<void> {
  const longMalformedBody = "<html><body>Internal Server Error. " + "x".repeat(500) + "</body></html>";

  await withMockedFetchAndConsole(
    () => new Response(longMalformedBody, { status: 500 }),
    async (capturedLogs) => {
      let thrown: unknown;
      try {
        await openRouterContractAnalysisProvider.generate({
          systemInstructions: "sys",
          userPrompt: "prompt",
        });
      } catch (err) {
        thrown = err;
      }

      assert.ok(
        thrown instanceof ContractAnalysisError && thrown.code === "PROVIDER_REQUEST_FAILED",
        "the existing PROVIDER_REQUEST_FAILED error must still be thrown unchanged for a non-429 non-ok status",
      );

      assert.equal(capturedLogs.length, 1);
      const [, payload] = capturedLogs[0] as [string, Record<string, unknown>];
      assert.equal(payload.httpStatus, 500);
      assert.equal(payload.errorCode, undefined, "no error.code exists in a non-JSON body");
      assert.equal(
        (payload.errorMessage as string).length,
        300,
        "errorMessage must be truncated to at most 300 characters for a malformed body",
      );
      assert.ok(
        longMalformedBody.startsWith(payload.errorMessage as string),
        "the truncated preview must be a prefix of the raw body",
      );

      console.log("PASS testMalformedBodyLogsTruncatedPreviewAndStillThrows");
    },
  );
}

async function testMissingHeadersDoNotCrashDiagnostic(): Promise<void> {
  await withMockedFetchAndConsole(
    () => new Response("", { status: 503 }),
    async (capturedLogs) => {
      let thrown: unknown;
      try {
        await openRouterContractAnalysisProvider.generate({
          systemInstructions: "sys",
          userPrompt: "prompt",
        });
      } catch (err) {
        thrown = err;
      }

      assert.ok(
        thrown instanceof ContractAnalysisError && thrown.code === "PROVIDER_REQUEST_FAILED",
        "an empty body and missing rate-limit headers must not change the thrown error",
      );

      assert.equal(capturedLogs.length, 1);
      const [, payload] = capturedLogs[0] as [string, Record<string, unknown>];
      assert.equal(payload.retryAfter, null, "a missing header must read as null, not throw");
      assert.equal(payload.errorMessage, "");

      console.log("PASS testMissingHeadersDoNotCrashDiagnostic");
    },
  );
}

export async function run(): Promise<void> {
  await testJsonRateLimitErrorLogsSafeDiagnostic();
  await testMalformedBodyLogsTruncatedPreviewAndStillThrows();
  await testMissingHeadersDoNotCrashDiagnostic();

  console.log("PASS openRouterProvider.httpErrorDiagnostics.test.ts");
}

run();
