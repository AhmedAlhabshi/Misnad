import assert from "node:assert/strict";
import { GeminiKeyPool, GeminiKeyPoolConfigError } from "../geminiKeyPool";

export function run(): void {
  // --- starts with first eligible key -----------------------------------
  {
    const pool = new GeminiKeyPool(["k1", "k2", "k3"], 120);
    const eligible = pool.getEligibleKeysInOrder();
    assert.deepEqual(
      eligible.map((k) => k.id),
      ["gemini_key_1", "gemini_key_2", "gemini_key_3"],
    );
    assert.equal(eligible[0]!.key, "k1");
  }
  console.log("PASS pool starts with all keys eligible, first (gemini_key_1) in front");

  // --- deterministic ordering: ids are derived purely from array position -----
  {
    const pool = new GeminiKeyPool(["alpha", "beta"], 120);
    const ids = pool.getEligibleKeysInOrder().map((k) => k.id);
    assert.deepEqual(ids, ["gemini_key_1", "gemini_key_2"]);
    // Never derived from the key value itself.
    assert.ok(!pool.getEligibleKeysInOrder().some((k) => k.id.includes("alpha") || k.id.includes("beta")));
  }
  console.log("PASS key ids are deterministic, derived only from array position, never the key value");

  // --- rotates on 429 (i.e. skips a key once its cooldown starts) -------------
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const now = Date.now();
    pool.startCooldown("gemini_key_1", 120, now);
    const eligible = pool.getEligibleKeysInOrder(now);
    assert.deepEqual(
      eligible.map((k) => k.id),
      ["gemini_key_2"],
    );
  }
  console.log("PASS a key placed in cooldown is skipped by getEligibleKeysInOrder");

  // --- skips cooling-down keys, deterministic order preserved among survivors --
  {
    const pool = new GeminiKeyPool(["k1", "k2", "k3"], 120);
    const now = Date.now();
    pool.startCooldown("gemini_key_2", 120, now);
    const eligible = pool.getEligibleKeysInOrder(now);
    assert.deepEqual(
      eligible.map((k) => k.id),
      ["gemini_key_1", "gemini_key_3"],
    );
  }
  console.log("PASS skips only the cooling-down key, keeping the rest in original order");

  // --- re-enables key after cooldown expires ----------------------------------
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const now = Date.now();
    pool.startCooldown("gemini_key_1", 120, now);
    assert.deepEqual(
      pool.getEligibleKeysInOrder(now).map((k) => k.id),
      ["gemini_key_2"],
    );
    // Just before expiry: still cooling down.
    assert.deepEqual(
      pool.getEligibleKeysInOrder(now + 119_999).map((k) => k.id),
      ["gemini_key_2"],
    );
    // At/after expiry: eligible again.
    assert.deepEqual(
      pool.getEligibleKeysInOrder(now + 120_000).map((k) => k.id),
      ["gemini_key_1", "gemini_key_2"],
    );
  }
  console.log("PASS a key becomes eligible again exactly once its cooldown has elapsed");

  // --- all keys exhausted (every key cooling down) -----------------------------
  {
    const pool = new GeminiKeyPool(["k1", "k2"], 120);
    const now = Date.now();
    pool.startCooldown("gemini_key_1", 120, now);
    pool.startCooldown("gemini_key_2", 120, now);
    assert.deepEqual(pool.getEligibleKeysInOrder(now), []);
    assert.deepEqual(pool.getAllKeyIds(), ["gemini_key_1", "gemini_key_2"]);
  }
  console.log("PASS getEligibleKeysInOrder returns empty once every key is cooling down");

  // --- never uses random selection: ordering is always the same call to call --
  {
    const pool = new GeminiKeyPool(["k1", "k2", "k3"], 120);
    const first = pool.getEligibleKeysInOrder().map((k) => k.id);
    const second = pool.getEligibleKeysInOrder().map((k) => k.id);
    assert.deepEqual(first, second);
  }
  console.log("PASS ordering is stable and repeatable across calls (never random)");

  // --- fails clearly if no valid Gemini key is configured -----------------------
  {
    assert.throws(() => new GeminiKeyPool([], 120), GeminiKeyPoolConfigError);
    try {
      new GeminiKeyPool([], 120);
      assert.fail("expected GeminiKeyPoolConfigError");
    } catch (error) {
      assert.ok(error instanceof GeminiKeyPoolConfigError);
      const message = (error as Error).message;
      // The failure message must never contain a key value (there are none configured here,
      // but this also documents that the constructor never echoes rawKeys into the message).
      assert.ok(!message.includes("undefined"));
    }
  }
  console.log("PASS constructing a pool with zero keys throws GeminiKeyPoolConfigError, with a safe message");

  // --- startCooldown on an unknown id is a safe no-op ---------------------------
  {
    const pool = new GeminiKeyPool(["k1"], 120);
    pool.startCooldown("gemini_key_999");
    assert.deepEqual(
      pool.getEligibleKeysInOrder().map((k) => k.id),
      ["gemini_key_1"],
    );
  }
  console.log("PASS startCooldown silently ignores an unknown key id");

  console.log("PASS geminiKeyPool.behavior.test.ts");
}

run();
