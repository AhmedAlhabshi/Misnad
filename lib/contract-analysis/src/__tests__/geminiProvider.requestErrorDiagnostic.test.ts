import assert from "node:assert/strict";
import { logGeminiRequestErrorDiagnostic } from "../providers/geminiProvider";

const SENSITIVE_API_KEY = "sk-gemini-totally-secret-test-key";
const SENSITIVE_PROMPT_MARKER = "MISNAD_SENSITIVE_PROMPT_MARKER_552211";

function withMockedConsole<T>(run: (capturedLogs: unknown[][]) => T): T {
  const originalConsoleError = console.error;
  const capturedLogs: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    capturedLogs.push(args);
  };
  try {
    return run(capturedLogs);
  } finally {
    console.error = originalConsoleError;
  }
}

function getDiagnosticPayload(capturedLogs: unknown[][]): Record<string, unknown> {
  assert.equal(capturedLogs.length, 1, "exactly one diagnostic must be logged per call");
  const [label, payload] = capturedLogs[0] as [string, Record<string, unknown>];
  assert.equal(label, "[MISNAD_DIAGNOSTIC]");
  assert.equal(payload.event, "gemini_request_error");
  return payload;
}

function testConnectionErrorWithCause(): void {
  const connectionError = Object.assign(new TypeError("fetch failed"), {
    cause: { code: "ECONNRESET" },
  });

  const payload = withMockedConsole((logs) => {
    logGeminiRequestErrorDiagnostic(connectionError, "gemini-2.5-flash");
    return getDiagnosticPayload(logs);
  });

  assert.equal(payload.provider, "gemini");
  assert.equal(payload.model, "gemini-2.5-flash");
  assert.equal(payload.errorName, "TypeError");
  assert.equal(payload.errorMessage, "fetch failed");
  assert.equal(payload.providerErrorCode, "ECONNRESET");
  assert.equal(payload.looksTimeoutOrNetwork, true, "an ECONNRESET cause must be flagged as network-related");
  assert.equal(payload.looksRateLimited, false);
  assert.equal(payload.maxOutputTokens, 65536);
  assert.equal(payload.statusCode, undefined, "a plain TypeError has no HTTP status");

  console.log("PASS testConnectionErrorWithCause");
}

function testApiErrorWithStatus(): void {
  const apiLikeError = Object.assign(new Error("Internal error"), { status: 500 });

  const payload = withMockedConsole((logs) => {
    logGeminiRequestErrorDiagnostic(apiLikeError, "gemini-2.5-flash");
    return getDiagnosticPayload(logs);
  });

  assert.equal(payload.statusCode, 500, "an ApiError-shaped error's numeric status must be captured");
  assert.equal(payload.looksRateLimited, false);

  console.log("PASS testApiErrorWithStatus");
}

function testRateLimitLikeMessageIsFlagged(): void {
  const rateLimitError = new Error("429 Too Many Requests: quota exceeded");

  const payload = withMockedConsole((logs) => {
    logGeminiRequestErrorDiagnostic(rateLimitError, "gemini-2.5-flash");
    return getDiagnosticPayload(logs);
  });

  assert.equal(payload.looksRateLimited, true);

  console.log("PASS testRateLimitLikeMessageIsFlagged");
}

function testLongMessageIsTruncatedAndNothingSensitiveLeaks(): void {
  const longMessage = `Upstream failure while processing request for ${SENSITIVE_PROMPT_MARKER} `.repeat(20);
  const errorWithLongMessage = new Error(longMessage);

  const capturedLogs = withMockedConsole((logs) => {
    logGeminiRequestErrorDiagnostic(errorWithLongMessage, "gemini-2.5-flash");
    return logs;
  });

  const payload = getDiagnosticPayload(capturedLogs);
  assert.equal((payload.errorMessage as string).length, 300, "the logged error message must be truncated to 300 characters");

  const serialized = JSON.stringify(capturedLogs);
  assert.equal(serialized.includes(SENSITIVE_API_KEY), false, "the API key must never be logged");
  assert.equal(serialized.includes("Bearer"), false, "no auth header content must ever be logged");
  assert.equal(
    "stack" in payload,
    false,
    "no stack trace field must ever be included in the diagnostic payload",
  );

  console.log("PASS testLongMessageIsTruncatedAndNothingSensitiveLeaks");
}

function testDiagnosticNeverThrows(): void {
  // A cyclic object as the error's "cause" must not crash JSON logging or
  // the diagnostic function itself — diagnostics must never interfere with
  // the real error path.
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const weirdError = Object.assign(new Error("weird"), { cause: cyclic });

  assert.doesNotThrow(() => {
    withMockedConsole(() => {
      logGeminiRequestErrorDiagnostic(weirdError, "gemini-2.5-flash");
    });
  });

  console.log("PASS testDiagnosticNeverThrows");
}

export function run(): void {
  testConnectionErrorWithCause();
  testApiErrorWithStatus();
  testRateLimitLikeMessageIsFlagged();
  testLongMessageIsTruncatedAndNothingSensitiveLeaks();
  testDiagnosticNeverThrows();

  console.log("PASS geminiProvider.requestErrorDiagnostic.test.ts");
}

run();
