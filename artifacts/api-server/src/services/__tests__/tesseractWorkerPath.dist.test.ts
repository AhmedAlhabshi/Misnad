import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createTesseractOcrProvider, renderPdfPagesToImages, resolveWorkerPath } from "@workspace/document-ocr";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distEntryPoint = path.resolve(__dirname, "../../../dist/index.mjs");

/**
 * Regression test for the "Cannot find module
 * .../artifacts/worker-script/node/index.js" crash: once
 * `@workspace/document-ocr` is bundled by esbuild into
 * `artifacts/api-server/dist/index.mjs`, every bundled module's `__dirname`
 * resolves to the *bundle's* directory (via this project's build.mjs banner
 * shim), which breaks tesseract.js's own `__dirname`-relative default
 * `workerPath`. The fix anchors resolution to `import.meta.url` via
 * `require.resolve` instead (see `resolveWorkerPath` in
 * `lib/document-ocr/src/ocrProvider/tesseractProvider.ts`), which is real
 * Node module resolution and unaffected by bundling.
 *
 * This test proves both halves of the fix:
 *  1. Resolving the worker script from a `createRequire` anchored at the
 *     *actual built* `dist/index.mjs` path — precisely simulating what
 *     happens at runtime once bundled — finds the real file on disk.
 *  2. The exact same `resolveWorkerPath()` function (unbundled here, but
 *     identical logic to what gets bundled) genuinely spins up a Tesseract
 *     worker and recognizes a rendered page, proving the resolved path is
 *     not just present on disk but actually loadable and functional.
 */
export async function run(): Promise<void> {
  assert.ok(
    fs.existsSync(distEntryPoint),
    `${distEntryPoint} must exist — run "pnpm --filter @workspace/api-server run build" before this test`,
  );

  // 1. Resolve exactly as the bundled code would, anchored at the real dist file.
  const distRequire = createRequire(pathToFileURL(distEntryPoint).href);
  const workerPathFromDistContext = distRequire.resolve("tesseract.js/src/worker-script/node/index.js");
  assert.ok(
    fs.existsSync(workerPathFromDistContext),
    `the Tesseract Node worker script must exist on disk at the path resolved from the built dist location: ${workerPathFromDistContext}`,
  );

  // 2. Sanity check: our own package's resolver (same logic, unbundled) agrees.
  const workerPathFromPackageContext = resolveWorkerPath();
  assert.ok(fs.existsSync(workerPathFromPackageContext));

  // 3. Prove the resolved path is genuinely usable: spin up a real worker and recognize a real rendered page.
  const contentStream = "BT /F1 18 Tf 40 750 Td (WORKER PATH OK) Tj ET";
  const pdf = buildMinimalTextPdf(contentStream);
  const { pages } = await renderPdfPagesToImages(pdf, [1]);
  assert.equal(pages.length, 1);

  const provider = createTesseractOcrProvider();
  const results = await provider.recognizePages(pages, {
    languages: "eng",
    pageTimeoutMs: 60_000,
    pageConcurrency: 1,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].warning, undefined, "the real Tesseract worker must recognize the page without error");
  assert.ok(results[0].text.toLowerCase().includes("worker"), "recognized text must contain real OCR output");

  console.log("PASS tesseractWorkerPath.dist.test.ts (worker path resolves correctly from the built dist context and is genuinely functional)");
}

/** Minimal single-page PDF with a real text stream (see `lib/document-ocr`'s own test fixture for the original). */
function buildMinimalTextPdf(contentStream: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

run().catch((err) => {
  console.error("FAIL tesseractWorkerPath.dist.test.ts:", err);
  process.exitCode = 1;
});
