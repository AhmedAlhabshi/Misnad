export interface OcrRuntimeConfig {
  /** Master switch — when `false`, a document that needs OCR fails with `OCR_DISABLED` instead of running it. */
  enabled: boolean;
  /** Documents with more pages than this are rejected before any rendering/OCR work starts. */
  maxPages: number;
  /** Overall budget for the whole OCR run (render + recognize every page). */
  timeoutMs: number;
  /** Budget for a single page's recognition — a page exceeding this is skipped, not fatal. */
  pageTimeoutMs: number;
  /** How many pages may be recognized concurrently. Kept low by default to bound memory/CPU use. */
  pageConcurrency: number;
  /** Tesseract-style language spec, e.g. `"ara+eng"`. */
  languages: string;
  /** PDF render resolution as a multiplier over a page's native 72-DPI point size — see `resolveRenderScale`. Defaults to ~300 DPI equivalent. */
  renderScale: number;
  /** Enables optional grayscale/contrast/threshold preprocessing (`imagePreprocessor.ts`) of rendered pages before OCR. Off by default — a no-op change in behavior unless explicitly turned on. */
  preprocessingEnabled: boolean;
}

/** A PDF's native unit is 1/72 inch — `renderScale` is expressed as a multiplier over this, so it can be derived from a requested DPI. */
const PDF_BASE_DPI = 72;
const DEFAULT_RENDER_DPI = 300;

/** Bounds `OCR_RENDER_SCALE`/`OCR_RENDER_DPI` so a misconfigured value can't make a single page's rendered image arbitrarily large — 1x is barely legible for small print, 8x (~576 DPI) is already far beyond what Tesseract benefits from. */
const MIN_RENDER_SCALE = 1;
const MAX_RENDER_SCALE = 8;

export const DEFAULT_OCR_RUNTIME_CONFIG: OcrRuntimeConfig = {
  enabled: true,
  maxPages: 30,
  timeoutMs: 120_000,
  pageTimeoutMs: 30_000,
  pageConcurrency: 1,
  languages: "ara+eng",
  renderScale: DEFAULT_RENDER_DPI / PDF_BASE_DPI,
  preprocessingEnabled: false,
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveFloat(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function clampRenderScale(scale: number): number {
  return Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, scale));
}

/**
 * `OCR_RENDER_SCALE` (a direct multiplier) takes precedence when set, since
 * it's the more explicit knob; otherwise `OCR_RENDER_DPI` is converted to a
 * scale; otherwise the documented ~300 DPI default. Either input is clamped
 * to a sane range rather than trusted verbatim.
 */
function resolveRenderScale(env: Record<string, string | undefined>): number {
  const explicitScale = parsePositiveFloat(env.OCR_RENDER_SCALE);
  if (explicitScale !== undefined) {
    return clampRenderScale(explicitScale);
  }
  const dpi = parsePositiveFloat(env.OCR_RENDER_DPI);
  if (dpi !== undefined) {
    return clampRenderScale(dpi / PDF_BASE_DPI);
  }
  return DEFAULT_OCR_RUNTIME_CONFIG.renderScale;
}

/**
 * Reads `OCR_*` environment variables with safe defaults — takes `env` as a
 * parameter (rather than reading `process.env` internally) so this stays a
 * pure, easily testable function.
 */
export function loadOcrConfigFromEnv(env: Record<string, string | undefined>): OcrRuntimeConfig {
  return {
    enabled: parseBoolean(env.OCR_ENABLED, DEFAULT_OCR_RUNTIME_CONFIG.enabled),
    maxPages: parsePositiveInt(env.OCR_MAX_PAGES, DEFAULT_OCR_RUNTIME_CONFIG.maxPages),
    timeoutMs: parsePositiveInt(env.OCR_TIMEOUT_MS, DEFAULT_OCR_RUNTIME_CONFIG.timeoutMs),
    pageTimeoutMs: parsePositiveInt(env.OCR_PAGE_TIMEOUT_MS, DEFAULT_OCR_RUNTIME_CONFIG.pageTimeoutMs),
    pageConcurrency: parsePositiveInt(env.OCR_PAGE_CONCURRENCY, DEFAULT_OCR_RUNTIME_CONFIG.pageConcurrency),
    languages: env.OCR_LANGUAGES?.trim() || DEFAULT_OCR_RUNTIME_CONFIG.languages,
    renderScale: resolveRenderScale(env),
    preprocessingEnabled: parseBoolean(env.OCR_PREPROCESSING_ENABLED, DEFAULT_OCR_RUNTIME_CONFIG.preprocessingEnabled),
  };
}
