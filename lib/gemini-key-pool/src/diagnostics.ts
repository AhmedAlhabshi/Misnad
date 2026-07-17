/**
 * Safe diagnostics for the Gemini key pool. Every function here accepts only
 * safe identifiers (a key's `gemini_key_N` id, a short reason string, a
 * numeric cooldown, an operation context label) — none of them accept, and
 * this module never has access to, an actual API key value, so there is no
 * code path by which a key value, prefix, suffix, or hash could reach a log
 * line from here. Each function is wrapped so a logging failure can never
 * interfere with the real Gemini request/rotation flow.
 */

function safeLog(payload: Record<string, unknown>): void {
  try {
    console.error("[MISNAD_DIAGNOSTIC]", payload);
  } catch {
    // Diagnostics must never interfere with the real request/rotation path.
  }
}

export function logGeminiKeyAttempt(keyId: string, context: string): void {
  safeLog({ event: "gemini_key_attempt", keyId, context });
}

/** Logged the moment a key's `generateContent` call is issued — pairs with `logGeminiKeyAttemptCompleted`/`logGeminiKeyAttemptTimedOut` via matching `keyId`+`context` to reconstruct that attempt's duration. */
export function logGeminiKeyAttemptStarted(keyId: string, context: string): void {
  safeLog({ event: "gemini_key_attempt_started", keyId, context });
}

/** Logged when a key's attempt is abandoned for exceeding `GEMINI_ATTEMPT_TIMEOUT_MS` — this is what lets rotation happen without waiting for the full route timeout. */
export function logGeminiKeyAttemptTimedOut(keyId: string, context: string, durationMs: number): void {
  safeLog({ event: "gemini_key_attempt_timed_out", keyId, context, durationMs });
}

/** Logged when a key's attempt finishes (successfully or with a non-timeout error) with how long it took. */
export function logGeminiKeyAttemptCompleted(
  keyId: string,
  context: string,
  durationMs: number,
  outcome: "success" | "error",
): void {
  safeLog({ event: "gemini_key_attempt_completed", keyId, context, durationMs, outcome });
}

/** Logged once per `runGeminiGenerateWithPool` call with the total wall-clock time across every key attempted. */
export function logGeminiPoolOperationCompleted(
  context: string,
  durationMs: number,
  outcome: "success" | "rate_limited" | "auth_failed",
): void {
  safeLog({ event: "gemini_pool_operation_completed", context, durationMs, outcome });
}

export function logGeminiKeyCooldownStarted(
  keyId: string,
  reason: string,
  cooldownSeconds: number,
  context: string,
): void {
  safeLog({ event: "gemini_key_cooldown_started", keyId, reason, cooldownSeconds, context });
}

export function logGeminiKeyRotated(fromKeyId: string, toKeyId: string, reason: string, context: string): void {
  safeLog({ event: "gemini_key_rotated", fromKeyId, toKeyId, reason, context });
}

export function logGeminiKeyAuthFailed(keyId: string, context: string): void {
  safeLog({ event: "gemini_key_auth_failed", keyId, context });
}

export function logGeminiKeyPoolExhausted(attemptedKeyIds: readonly string[], context: string): void {
  safeLog({ event: "gemini_key_pool_exhausted", attemptedKeyIds, context });
}
