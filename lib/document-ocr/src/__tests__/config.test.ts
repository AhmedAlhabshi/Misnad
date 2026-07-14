import assert from "node:assert/strict";
import { DEFAULT_OCR_RUNTIME_CONFIG, loadOcrConfigFromEnv } from "../config";

export function run(): void {
  // 1. No env vars set at all -> exactly the documented defaults.
  {
    const config = loadOcrConfigFromEnv({});
    assert.deepEqual(config, DEFAULT_OCR_RUNTIME_CONFIG);
  }
  console.log("PASS empty env -> documented defaults");

  // 2. Every variable can be overridden.
  {
    const config = loadOcrConfigFromEnv({
      OCR_ENABLED: "false",
      OCR_MAX_PAGES: "10",
      OCR_TIMEOUT_MS: "60000",
      OCR_PAGE_TIMEOUT_MS: "15000",
      OCR_PAGE_CONCURRENCY: "2",
      OCR_LANGUAGES: "eng",
      OCR_RENDER_SCALE: "3",
      OCR_PREPROCESSING_ENABLED: "true",
    });
    assert.equal(config.enabled, false);
    assert.equal(config.maxPages, 10);
    assert.equal(config.timeoutMs, 60_000);
    assert.equal(config.pageTimeoutMs, 15_000);
    assert.equal(config.pageConcurrency, 2);
    assert.equal(config.languages, "eng");
    assert.equal(config.renderScale, 3);
    assert.equal(config.preprocessingEnabled, true);
  }
  console.log("PASS every OCR_* variable overrides its default");

  // 5. Render scale/DPI: default is ~300 DPI, OCR_RENDER_SCALE wins over OCR_RENDER_DPI, and both are clamped to a sane range.
  {
    assert.ok(Math.abs(DEFAULT_OCR_RUNTIME_CONFIG.renderScale - 300 / 72) < 1e-9, "default render scale must be the documented ~300 DPI equivalent");
    assert.equal(loadOcrConfigFromEnv({ OCR_RENDER_DPI: "150" }).renderScale, 150 / 72);
    assert.equal(
      loadOcrConfigFromEnv({ OCR_RENDER_SCALE: "5", OCR_RENDER_DPI: "150" }).renderScale,
      5,
      "an explicit OCR_RENDER_SCALE must take precedence over OCR_RENDER_DPI",
    );
    assert.equal(loadOcrConfigFromEnv({ OCR_RENDER_SCALE: "999" }).renderScale, 8, "an unreasonably large scale must be clamped");
    assert.equal(loadOcrConfigFromEnv({ OCR_RENDER_SCALE: "0.01" }).renderScale, 1, "an unreasonably small scale must be clamped");
    assert.equal(loadOcrConfigFromEnv({ OCR_RENDER_SCALE: "not-a-number" }).renderScale, DEFAULT_OCR_RUNTIME_CONFIG.renderScale);
    assert.equal(loadOcrConfigFromEnv({}).preprocessingEnabled, false, "preprocessing must default to off");
  }
  console.log("PASS render scale/DPI resolution, precedence, and clamping");

  // 3. Boolean parsing accepts "1"/"0" as well as "true"/"false".
  {
    assert.equal(loadOcrConfigFromEnv({ OCR_ENABLED: "1" }).enabled, true);
    assert.equal(loadOcrConfigFromEnv({ OCR_ENABLED: "0" }).enabled, false);
  }
  console.log("PASS boolean parsing accepts 1/0 aliases");

  // 4. Invalid/garbage values fall back to the safe default rather than producing NaN or a negative number.
  {
    const config = loadOcrConfigFromEnv({
      OCR_MAX_PAGES: "not-a-number",
      OCR_TIMEOUT_MS: "-5",
      OCR_PAGE_CONCURRENCY: "0",
      OCR_ENABLED: "maybe",
    });
    assert.equal(config.maxPages, DEFAULT_OCR_RUNTIME_CONFIG.maxPages);
    assert.equal(config.timeoutMs, DEFAULT_OCR_RUNTIME_CONFIG.timeoutMs);
    assert.equal(config.pageConcurrency, DEFAULT_OCR_RUNTIME_CONFIG.pageConcurrency);
    assert.equal(config.enabled, DEFAULT_OCR_RUNTIME_CONFIG.enabled);
    assert.ok(Number.isFinite(config.maxPages) && config.maxPages > 0);
  }
  console.log("PASS invalid values fall back to safe defaults, never NaN/negative");

  console.log("PASS config.test.ts");
}

run();
