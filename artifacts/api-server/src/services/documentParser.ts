import pdfParse from "pdf-parse";
import {
  createTesseractOcrProvider,
  loadOcrConfigFromEnv,
  renderPdfPagesToImages,
  runOcrFallbackPipeline,
  type DiagnosticEventListener,
  type DocumentExtractionResult,
  type OcrProvider,
  type OcrRuntimeConfig,
} from "@workspace/document-ocr";

export interface NativeParseResult {
  text: string;
  pageCount: number;
}

/** Isolated purely so tests can inject a fake native parser (no real `pdf-parse`/PDF binary needed) — the real implementation is the production default. */
export type NativeTextParser = (buffer: Buffer) => Promise<NativeParseResult>;

async function parseNativeText(buffer: Buffer): Promise<NativeParseResult> {
  let parsed: Awaited<ReturnType<typeof pdfParse>>;
  try {
    parsed = await pdfParse(buffer);
  } catch {
    throw new Error("Failed to parse PDF — the file may be corrupted or password-protected");
  }
  const text = parsed.text ?? "";
  const pageCount = parsed.numpages > 0 ? parsed.numpages : 1;
  return { text, pageCount };
}

const defaultOcrProvider = createTesseractOcrProvider();

/**
 * Injectable so tests can swap the native parser/OCR provider/renderer/config
 * for fakes (never a real PDF binary, never real Tesseract/pdfjs-dist) or
 * capture diagnostic events, without a live PDF/OCR call. Production code
 * never passes this — the real implementations and environment-derived
 * config are the defaults.
 */
export interface ExtractDocumentTextDeps {
  parseNativeText: NativeTextParser;
  ocrProvider: OcrProvider;
  renderPdfPagesToImages: typeof renderPdfPagesToImages;
  config: OcrRuntimeConfig;
  onEvent?: DiagnosticEventListener;
}

function defaultDeps(): ExtractDocumentTextDeps {
  return {
    parseNativeText,
    ocrProvider: defaultOcrProvider,
    renderPdfPagesToImages,
    config: loadOcrConfigFromEnv(process.env),
  };
}

/**
 * The single entry point for turning an uploaded PDF's raw bytes into
 * trustworthy text — the sole decision-maker for native-text-layer versus
 * OCR. Never returns unmasked text to the caller for any purpose other than
 * immediately feeding it into PII masking next; the recognized/extracted
 * text itself is never logged here.
 *
 * `overrides` lets callers replace individual dependencies (e.g. the route
 * wiring its own request-scoped logger as `onEvent`, or a test supplying a
 * fake `ocrProvider`) without needing to reconstruct the real Tesseract
 * provider or environment-derived config themselves — anything not
 * overridden falls back to the real, production default.
 */
export async function extractDocumentText(
  buffer: Buffer,
  overrides: Partial<ExtractDocumentTextDeps> = {},
): Promise<DocumentExtractionResult> {
  const deps: ExtractDocumentTextDeps = { ...defaultDeps(), ...overrides };
  const startedAt = Date.now();

  const { text: nativeText, pageCount: nativePageCount } = await deps.parseNativeText(buffer);

  deps.onEvent?.("document_native_extraction_completed", {
    pageCount: nativePageCount,
    textLength: nativeText.length,
  });

  const result = await runOcrFallbackPipeline(
    { buffer, nativeText, nativePageCount },
    {
      config: deps.config,
      ocrProvider: deps.ocrProvider,
      renderPdfPagesToImages: deps.renderPdfPagesToImages,
      onEvent: deps.onEvent,
    },
  );

  deps.onEvent?.("document_extraction_completed", {
    method: result.method,
    pageCount: result.pageCount,
    quality: result.quality,
    ocrUsed: result.metadata.ocrUsed,
    durationMs: Date.now() - startedAt,
  });

  return result;
}
