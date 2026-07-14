import assert from "node:assert/strict";
import { buildMinimalTextPdf } from "./fixtures/minimalPdf";
import { createTesseractOcrProvider } from "../ocrProvider/tesseractProvider";
import { renderPdfPagesToImages } from "../pdfPageRenderer";

/**
 * Deliberately separate from the fast test suite (its own `test:real-ocr`
 * script, not chained into `test`): this exercises the real, local
 * PDF-render → Tesseract-recognize path end to end, with no fakes/mocks. It
 * downloads/uses real trained-language data and takes tens of seconds, so it
 * must never run as part of the default fast suite.
 */
export async function run(): Promise<void> {
  const pdf = buildMinimalTextPdf("Hello World Contract");
  const { pages, failedPageNumbers } = await renderPdfPagesToImages(pdf, [1]);

  assert.equal(failedPageNumbers.length, 0, "rendering the minimal test PDF must not fail");
  assert.equal(pages.length, 1);
  assert.ok(pages[0].png.length > 0, "the rendered page must produce a non-empty PNG buffer");

  const provider = createTesseractOcrProvider();
  const results = await provider.recognizePages(pages, {
    languages: "eng",
    pageTimeoutMs: 60_000,
    pageConcurrency: 1,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].warning, undefined, "recognition of a clean, rendered page must not warn");
  assert.ok(results[0].confidence !== undefined && results[0].confidence > 30, "confidence must be reasonably high for clean rendered text");

  const recognizedText = results[0].text.toLowerCase();
  assert.ok(recognizedText.includes("hello"), `recognized text must contain "hello" (got: length ${recognizedText.length})`);
  assert.ok(recognizedText.includes("world"), `recognized text must contain "world" (got: length ${recognizedText.length})`);

  console.log("PASS tesseractProvider.real.test.ts (real Tesseract recognized the rendered page correctly)");
}

run().catch((err) => {
  console.error("FAIL tesseractProvider.real.test.ts:", err);
  process.exitCode = 1;
});
