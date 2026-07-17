import { parseGeminiApiKeys, parseGeminiKeyCooldownSeconds } from "./env";

/**
 * Thrown when no valid Gemini API key is configured at all. Deliberately a
 * plain, generic error (never mentions a specific env var value) — each
 * consumer (contract-analysis's `ContractAnalysisError`, legal-rag's
 * `EmbeddingError`) catches this and rethrows its own domain-specific
 * "missing API key" error so existing error codes/messages at call sites
 * are unaffected by introducing this shared pool.
 */
export class GeminiKeyPoolConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiKeyPoolConfigError";
  }
}

export interface GeminiKeyState {
  /** Safe identifier derived only from array position, e.g. "gemini_key_1" — never derived from or containing the key value. */
  readonly id: string;
  readonly key: string;
  cooldownUntil: number | null;
}

/**
 * Process-memory-only pool of configured Gemini API keys with per-key
 * cooldown tracking. Never persists anything to disk, a database, or any
 * external store — state lives exactly as long as the Node process and is
 * lost (and safely re-derived from env on next read) on restart.
 *
 * Concurrency: all methods are synchronous and this class holds no async
 * state, so concurrent requests in the same process naturally observe the
 * same in-memory cooldown state without any locking — one request starting
 * a cooldown on a key is immediately visible to every other in-flight
 * request's next `getEligibleKeysInOrder()` call.
 */
export class GeminiKeyPool {
  private readonly keys: GeminiKeyState[];
  public readonly cooldownSeconds: number;

  constructor(rawKeys: readonly string[], cooldownSeconds: number) {
    if (rawKeys.length === 0) {
      throw new GeminiKeyPoolConfigError(
        "No Gemini API key is configured. Set GEMINI_API_KEYS (comma-separated) or GEMINI_API_KEY.",
      );
    }

    this.cooldownSeconds = cooldownSeconds;
    this.keys = rawKeys.map((key, index) => ({
      id: `gemini_key_${index + 1}`,
      key,
      cooldownUntil: null,
    }));
  }

  /**
   * Returns every currently non-cooling-down key, in the same deterministic
   * order the pool was configured in (array position — never random). A key
   * whose cooldown has elapsed (`cooldownUntil <= now`) is eligible again.
   */
  getEligibleKeysInOrder(now: number = Date.now()): GeminiKeyState[] {
    return this.keys.filter((state) => state.cooldownUntil === null || state.cooldownUntil <= now);
  }

  /** Every configured key's safe id, regardless of cooldown state — used only for diagnostics (e.g. reporting which ids were attempted). */
  getAllKeyIds(): string[] {
    return this.keys.map((state) => state.id);
  }

  get size(): number {
    return this.keys.length;
  }

  /**
   * Starts (or extends) a cooldown for the given key id. Looked up by id
   * (never by key value) so callers never need to hold onto a raw key.
   * Silently a no-op for an unknown id — defensive, should never happen in
   * practice since ids only ever come from this same pool's own state.
   */
  startCooldown(id: string, seconds: number = this.cooldownSeconds, now: number = Date.now()): void {
    const state = this.keys.find((k) => k.id === id);
    if (!state) return;
    state.cooldownUntil = now + seconds * 1000;
  }
}

let sharedPool: GeminiKeyPool | null = null;

/**
 * Lazily constructs (and memoizes) the single process-wide `GeminiKeyPool`
 * from the real environment. Every Gemini consumer that opts into the pool
 * (contract-analysis's text provider, legal-rag's embedding provider) shares
 * this exact instance — they use the same `GEMINI_API_KEY(S)` credentials,
 * so a key cooling down for one operation is correctly skipped by the
 * other too, while each still logs its own operation-specific `context`.
 *
 * Throws `GeminiKeyPoolConfigError` if no key is configured. Never caches a
 * failed construction — a later call (e.g. after the env is fixed without a
 * process restart, such as in a test) will retry parsing from scratch.
 */
export function getSharedGeminiKeyPool(): GeminiKeyPool {
  if (!sharedPool) {
    const keys = parseGeminiApiKeys(process.env);
    const cooldownSeconds = parseGeminiKeyCooldownSeconds(process.env);
    sharedPool = new GeminiKeyPool(keys, cooldownSeconds);
  }
  return sharedPool;
}

/**
 * TEST-ONLY: clears the memoized shared pool so the next
 * `getSharedGeminiKeyPool()` call re-reads `process.env`. Never called from
 * production code paths.
 */
export function resetSharedGeminiKeyPoolForTests(): void {
  sharedPool = null;
}
