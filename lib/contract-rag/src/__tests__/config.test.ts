import assert from "node:assert/strict";
import { DEFAULT_CONTRACT_RAG_CONFIG, getContractRagConfig } from "../config";

const ENV_KEYS = [
  "CONTRACT_RAG_TTL_MINUTES",
  "CONTRACT_RAG_MAX_INDEXED_CHARS",
  "CONTRACT_RAG_MAX_CHUNKS_PER_CONTRACT",
  "CONTRACT_RAG_MAX_CHUNK_CHARS",
  "CONTRACT_RAG_MAX_QUERY_CHARS",
  "CONTRACT_RAG_MAX_TOP_K",
  "CONTRACT_RAG_MAX_EXCERPT_CHARS",
  "CONTRACT_RAG_MAX_TOTAL_CONTEXT_CHARS",
  "CONTRACT_RAG_MIN_RELEVANCE_SCORE",
] as const;

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

export function run(): void {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  try {
    // 1. No env vars set -> exactly the documented defaults.
    clearEnv();
    assert.deepEqual(getContractRagConfig(), DEFAULT_CONTRACT_RAG_CONFIG);
    console.log("PASS empty env -> documented defaults");

    // 2. Every bound can be overridden, including the TTL — never hardcoded.
    clearEnv();
    process.env.CONTRACT_RAG_TTL_MINUTES = "45";
    process.env.CONTRACT_RAG_MAX_INDEXED_CHARS = "1000";
    process.env.CONTRACT_RAG_MAX_CHUNKS_PER_CONTRACT = "5";
    process.env.CONTRACT_RAG_MAX_CHUNK_CHARS = "500";
    process.env.CONTRACT_RAG_MAX_QUERY_CHARS = "100";
    process.env.CONTRACT_RAG_MAX_TOP_K = "3";
    process.env.CONTRACT_RAG_MAX_EXCERPT_CHARS = "200";
    process.env.CONTRACT_RAG_MAX_TOTAL_CONTEXT_CHARS = "1000";
    process.env.CONTRACT_RAG_MIN_RELEVANCE_SCORE = "0.5";
    const overridden = getContractRagConfig();
    assert.equal(overridden.ttlMinutes, 45);
    assert.equal(overridden.maxIndexedChars, 1000);
    assert.equal(overridden.maxChunksPerContract, 5);
    assert.equal(overridden.maxChunkChars, 500);
    assert.equal(overridden.maxQueryChars, 100);
    assert.equal(overridden.maxTopK, 3);
    assert.equal(overridden.maxExcerptChars, 200);
    assert.equal(overridden.maxTotalContextChars, 1000);
    assert.equal(overridden.minRelevanceScore, 0.5);
    console.log("PASS every CONTRACT_RAG_* variable overrides its default");

    // 3. Invalid/garbage values fall back to the safe default, never NaN/negative/zero.
    clearEnv();
    process.env.CONTRACT_RAG_TTL_MINUTES = "not-a-number";
    process.env.CONTRACT_RAG_MAX_TOP_K = "-5";
    process.env.CONTRACT_RAG_MIN_RELEVANCE_SCORE = "0";
    const invalid = getContractRagConfig();
    assert.equal(invalid.ttlMinutes, DEFAULT_CONTRACT_RAG_CONFIG.ttlMinutes);
    assert.equal(invalid.maxTopK, DEFAULT_CONTRACT_RAG_CONFIG.maxTopK);
    assert.equal(invalid.minRelevanceScore, DEFAULT_CONTRACT_RAG_CONFIG.minRelevanceScore);
    console.log("PASS invalid values fall back to safe defaults, never NaN/negative/zero");

    // 4. Config is read fresh on every call, not cached at module load.
    clearEnv();
    process.env.CONTRACT_RAG_TTL_MINUTES = "10";
    assert.equal(getContractRagConfig().ttlMinutes, 10);
    process.env.CONTRACT_RAG_TTL_MINUTES = "20";
    assert.equal(getContractRagConfig().ttlMinutes, 20, "config must re-read process.env on every call, not cache at module load");
    console.log("PASS config is read fresh on every call");

    console.log("PASS config.test.ts");
  } finally {
    clearEnv();
    for (const key of ENV_KEYS) {
      if (saved[key] !== undefined) process.env[key] = saved[key];
    }
  }
}

run();
