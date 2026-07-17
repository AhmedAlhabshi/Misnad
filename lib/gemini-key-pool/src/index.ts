export {
  GEMINI_API_KEYS_ENV_VAR,
  GEMINI_API_KEY_ENV_VAR,
  GEMINI_KEY_COOLDOWN_SECONDS_ENV_VAR,
  GEMINI_ATTEMPT_TIMEOUT_MS_ENV_VAR,
  DEFAULT_GEMINI_KEY_COOLDOWN_SECONDS,
  DEFAULT_GEMINI_ATTEMPT_TIMEOUT_MS,
  parseGeminiApiKeys,
  parseGeminiKeyCooldownSeconds,
  parseGeminiAttemptTimeoutMs,
} from "./env";

export {
  GeminiKeyPool,
  GeminiKeyPoolConfigError,
  getSharedGeminiKeyPool,
  resetSharedGeminiKeyPoolForTests,
  type GeminiKeyState,
} from "./geminiKeyPool";

export {
  logGeminiKeyAttempt,
  logGeminiKeyAttemptStarted,
  logGeminiKeyAttemptTimedOut,
  logGeminiKeyAttemptCompleted,
  logGeminiPoolOperationCompleted,
  logGeminiKeyCooldownStarted,
  logGeminiKeyRotated,
  logGeminiKeyAuthFailed,
  logGeminiKeyPoolExhausted,
} from "./diagnostics";
