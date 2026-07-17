import assert from "node:assert/strict";
import {
  DEFAULT_GEMINI_KEY_COOLDOWN_SECONDS,
  parseGeminiApiKeys,
  parseGeminiKeyCooldownSeconds,
} from "../env";

export function run(): void {
  // --- multiple comma-separated keys ---------------------------------------
  {
    const keys = parseGeminiApiKeys({ GEMINI_API_KEYS: "key_1,key_2,key_3" });
    assert.deepEqual(keys, ["key_1", "key_2", "key_3"]);
  }
  console.log("PASS parseGeminiApiKeys splits multiple comma-separated keys");

  // --- whitespace trimming ---------------------------------------------------
  {
    const keys = parseGeminiApiKeys({ GEMINI_API_KEYS: "  key_1 , key_2  ,key_3  " });
    assert.deepEqual(keys, ["key_1", "key_2", "key_3"]);
  }
  console.log("PASS parseGeminiApiKeys trims whitespace around each key");

  // --- empty entries ignored --------------------------------------------------
  {
    const keys = parseGeminiApiKeys({ GEMINI_API_KEYS: "key_1,,key_2,   ,key_3," });
    assert.deepEqual(keys, ["key_1", "key_2", "key_3"]);
  }
  console.log("PASS parseGeminiApiKeys ignores empty entries from stray/trailing commas");

  // --- duplicate entries removed, first occurrence order preserved -----------
  {
    const keys = parseGeminiApiKeys({ GEMINI_API_KEYS: "key_1,key_2,key_1,key_3,key_2" });
    assert.deepEqual(keys, ["key_1", "key_2", "key_3"]);
  }
  console.log("PASS parseGeminiApiKeys removes exact duplicates, preserving first-seen order");

  // --- backward-compatible single-key setup (no GEMINI_API_KEYS at all) ------
  {
    const keys = parseGeminiApiKeys({ GEMINI_API_KEY: "solo_key" });
    assert.deepEqual(keys, ["solo_key"]);
  }
  console.log("PASS parseGeminiApiKeys falls back to the single-key GEMINI_API_KEY when GEMINI_API_KEYS is absent");

  // --- GEMINI_API_KEYS takes precedence when both are set --------------------
  {
    const keys = parseGeminiApiKeys({ GEMINI_API_KEYS: "key_a,key_b", GEMINI_API_KEY: "legacy_key" });
    assert.deepEqual(keys, ["key_a", "key_b"]);
  }
  console.log("PASS parseGeminiApiKeys prefers GEMINI_API_KEYS over GEMINI_API_KEY when both are set");

  // --- blank GEMINI_API_KEYS falls back to GEMINI_API_KEY ---------------------
  {
    const keys = parseGeminiApiKeys({ GEMINI_API_KEYS: "   ", GEMINI_API_KEY: "legacy_key" });
    assert.deepEqual(keys, ["legacy_key"]);
  }
  console.log("PASS parseGeminiApiKeys falls back to GEMINI_API_KEY when GEMINI_API_KEYS is only whitespace");

  // --- no configured key at all -----------------------------------------------
  {
    const keys = parseGeminiApiKeys({});
    assert.deepEqual(keys, []);
  }
  {
    const keys = parseGeminiApiKeys({ GEMINI_API_KEYS: "", GEMINI_API_KEY: "" });
    assert.deepEqual(keys, []);
  }
  console.log("PASS parseGeminiApiKeys returns an empty array (never throws) when no key is configured");

  // --- cooldown seconds parsing ------------------------------------------------
  assert.equal(parseGeminiKeyCooldownSeconds({}), DEFAULT_GEMINI_KEY_COOLDOWN_SECONDS);
  assert.equal(parseGeminiKeyCooldownSeconds({ GEMINI_KEY_COOLDOWN_SECONDS: "" }), DEFAULT_GEMINI_KEY_COOLDOWN_SECONDS);
  assert.equal(parseGeminiKeyCooldownSeconds({ GEMINI_KEY_COOLDOWN_SECONDS: "not-a-number" }), DEFAULT_GEMINI_KEY_COOLDOWN_SECONDS);
  assert.equal(parseGeminiKeyCooldownSeconds({ GEMINI_KEY_COOLDOWN_SECONDS: "-5" }), DEFAULT_GEMINI_KEY_COOLDOWN_SECONDS);
  assert.equal(parseGeminiKeyCooldownSeconds({ GEMINI_KEY_COOLDOWN_SECONDS: "0" }), DEFAULT_GEMINI_KEY_COOLDOWN_SECONDS);
  assert.equal(parseGeminiKeyCooldownSeconds({ GEMINI_KEY_COOLDOWN_SECONDS: "300" }), 300);
  assert.equal(parseGeminiKeyCooldownSeconds({ GEMINI_KEY_COOLDOWN_SECONDS: "  45  " }), 45);
  console.log("PASS parseGeminiKeyCooldownSeconds uses the configured value or falls back to the safe default");

  console.log("PASS env.parsing.test.ts");
}

run();
