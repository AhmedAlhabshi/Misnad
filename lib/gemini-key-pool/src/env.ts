/**
 * Environment variable names read by the Gemini key pool. `GEMINI_API_KEY`
 * is the pre-existing single-key variable (already read directly by
 * `geminiProvider.ts` and `geminiEmbeddingProvider.ts` before this pool
 * existed) — kept as the backward-compatible fallback, never renamed.
 */
export const GEMINI_API_KEYS_ENV_VAR = "GEMINI_API_KEYS";
export const GEMINI_API_KEY_ENV_VAR = "GEMINI_API_KEY";
export const GEMINI_KEY_COOLDOWN_SECONDS_ENV_VAR = "GEMINI_KEY_COOLDOWN_SECONDS";
export const GEMINI_ATTEMPT_TIMEOUT_MS_ENV_VAR = "GEMINI_ATTEMPT_TIMEOUT_MS";

/** Used whenever `GEMINI_KEY_COOLDOWN_SECONDS` is absent or not a valid positive number. */
export const DEFAULT_GEMINI_KEY_COOLDOWN_SECONDS = 120;

/** Used whenever `GEMINI_ATTEMPT_TIMEOUT_MS` is absent or not a valid positive number. */
export const DEFAULT_GEMINI_ATTEMPT_TIMEOUT_MS = 10_000;

type EnvSource = Pick<NodeJS.ProcessEnv, string> | Record<string, string | undefined>;

/**
 * Parses the configured Gemini API key(s) into a deduplicated, ordered list
 * of raw key strings. Never throws and never logs — an empty result simply
 * means "no key configured," left for the caller to react to.
 *
 * `GEMINI_API_KEYS` (comma-separated) takes precedence when present and
 * non-empty; otherwise falls back to the single-key `GEMINI_API_KEY`
 * variable for backward compatibility. Both are parsed identically (split
 * on commas, trim whitespace, drop empty entries, drop exact duplicates
 * while preserving first-seen order) — a single-key value with no commas
 * simply yields a one-element array, so existing single-key setups behave
 * exactly as before.
 */
export function parseGeminiApiKeys(env: EnvSource): string[] {
  const multi = env[GEMINI_API_KEYS_ENV_VAR];
  const raw = multi && multi.trim().length > 0 ? multi : env[GEMINI_API_KEY_ENV_VAR];

  if (!raw) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

/**
 * Parses `GEMINI_KEY_COOLDOWN_SECONDS`, falling back to
 * `DEFAULT_GEMINI_KEY_COOLDOWN_SECONDS` when absent, blank, non-numeric, or
 * not a positive number — a malformed value degrades to the safe default
 * rather than throwing, since a cooldown duration is not something that
 * should ever block startup.
 */
export function parseGeminiKeyCooldownSeconds(env: EnvSource): number {
  const raw = env[GEMINI_KEY_COOLDOWN_SECONDS_ENV_VAR];
  if (!raw || raw.trim().length === 0) {
    return DEFAULT_GEMINI_KEY_COOLDOWN_SECONDS;
  }

  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_GEMINI_KEY_COOLDOWN_SECONDS;
  }

  return parsed;
}

/**
 * Parses `GEMINI_ATTEMPT_TIMEOUT_MS` — the maximum time a single Gemini API
 * key is given to respond to one `generateContent` call before it's treated
 * as unresponsive, cooled down, and rotated past (see `runGeminiGenerateWithPool`
 * in `geminiProvider.ts`). Falls back to `DEFAULT_GEMINI_ATTEMPT_TIMEOUT_MS`
 * when absent, blank, non-numeric, or not a positive number — same
 * fail-safe-to-default shape as `parseGeminiKeyCooldownSeconds`.
 */
export function parseGeminiAttemptTimeoutMs(env: EnvSource): number {
  const raw = env[GEMINI_ATTEMPT_TIMEOUT_MS_ENV_VAR];
  if (!raw || raw.trim().length === 0) {
    return DEFAULT_GEMINI_ATTEMPT_TIMEOUT_MS;
  }

  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_GEMINI_ATTEMPT_TIMEOUT_MS;
  }

  return parsed;
}
