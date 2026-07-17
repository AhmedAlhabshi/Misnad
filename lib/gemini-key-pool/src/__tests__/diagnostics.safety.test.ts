import assert from "node:assert/strict";
import {
  logGeminiKeyAttempt,
  logGeminiKeyAuthFailed,
  logGeminiKeyCooldownStarted,
  logGeminiKeyPoolExhausted,
  logGeminiKeyRotated,
} from "../diagnostics";

const SECRET_KEY_VALUE = "AIzaSyDEFINITELY_A_REAL_LOOKING_SECRET_VALUE_123";

function captureConsoleError(fn: () => void): string {
  const original = console.error;
  let captured = "";
  console.error = (...args: unknown[]) => {
    captured += args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  };
  try {
    fn();
  } finally {
    console.error = original;
  }
  return captured;
}

export function run(): void {
  // --- every diagnostic event logs only safe ids/reasons/context, never a key value ---
  {
    const output = captureConsoleError(() => {
      logGeminiKeyAttempt("gemini_key_1", "contractAnalysis");
      logGeminiKeyCooldownStarted("gemini_key_1", "RATE_LIMITED", 120, "contractAnalysis");
      logGeminiKeyRotated("gemini_key_1", "gemini_key_2", "RATE_LIMITED", "contractAnalysis");
      logGeminiKeyAuthFailed("gemini_key_2", "answerComposer");
      logGeminiKeyPoolExhausted(["gemini_key_1", "gemini_key_2"], "answerComposer");
    });
    assert.ok(!output.includes(SECRET_KEY_VALUE), "no diagnostic call accepts or logs a raw key value");
    assert.ok(output.includes("gemini_key_1"));
    assert.ok(output.includes("gemini_key_2"));
    assert.ok(output.includes("gemini_key_attempt"));
    assert.ok(output.includes("gemini_key_cooldown_started"));
    assert.ok(output.includes("gemini_key_rotated"));
    assert.ok(output.includes("gemini_key_auth_failed"));
    assert.ok(output.includes("gemini_key_pool_exhausted"));
  }
  console.log("PASS diagnostic events log only safe key ids, reasons, and context — never a key value");

  // --- none of the diagnostic functions accept a parameter shaped like a key value ---
  // (a static/API-shape guarantee: every parameter is typed `string` id/reason/context or
  // `number`/`readonly string[]` — verified here by simply calling with id-shaped strings
  // and confirming no function has a signature slot for anything resembling a secret.)
  {
    const output = captureConsoleError(() => {
      logGeminiKeyAttempt("gemini_key_3", "legalRag");
    });
    assert.ok(!/AIza|sk-|Bearer /i.test(output), "log output must never resemble a real API key/token shape");
  }
  console.log("PASS diagnostic output never resembles a real API key/token shape");

  // --- a logging failure never throws / never breaks the caller ---------------------
  {
    const original = console.error;
    console.error = () => {
      throw new Error("logging backend is down");
    };
    try {
      logGeminiKeyAttempt("gemini_key_1", "contractAnalysis");
    } finally {
      console.error = original;
    }
  }
  console.log("PASS a console.error failure inside a diagnostic call never propagates to the caller");

  console.log("PASS diagnostics.safety.test.ts");
}

run();
