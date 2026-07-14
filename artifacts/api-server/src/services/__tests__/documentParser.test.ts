import assert from "node:assert/strict";
import {
  DEFAULT_OCR_RUNTIME_CONFIG,
  DocumentOcrError,
  type OcrPageResult,
  type OcrProvider,
  type RenderedPdfPage,
} from "@workspace/document-ocr";
import { extractDocumentText, type NativeParseResult } from "../documentParser";

function fakeNativeParser(result: NativeParseResult): () => Promise<NativeParseResult> {
  return async () => result;
}

function fakeRenderer(pages: readonly RenderedPdfPage[]) {
  return async () => ({ pages: [...pages], failedPageNumbers: [] });
}

function fakePage(pageNumber: number): RenderedPdfPage {
  return { pageNumber, png: Buffer.from(`fake-png-${pageNumber}`), width: 100, height: 100 };
}

function fakeOcrProvider(results: readonly OcrPageResult[]): OcrProvider {
  return {
    async recognizePages() {
      return [...results];
    },
  };
}

const GOOD_NATIVE_TEXT =
  "This is a perfectly readable contract with plenty of real words describing the agreement terms in detail. Amount 120000 SAR.".repeat(
    2,
  );
const GOOD_OCR_TEXT =
  "This is the OCR-recognized contract text, long and clean, reading as genuine prose describing obligations in full.".repeat(
    3,
  );

/** 1. Native readable PDF: the OCR provider must never be invoked. */
async function testNativeReadablePdfSkipsOcr(): Promise<void> {
  let ocrCalled = false;

  const result = await extractDocumentText(Buffer.from("fake-pdf-bytes"), {
    parseNativeText: fakeNativeParser({ text: GOOD_NATIVE_TEXT, pageCount: 1 }),
    ocrProvider: {
      async recognizePages() {
        ocrCalled = true;
        return [];
      },
    },
  });

  assert.equal(result.method, "native");
  assert.equal(result.metadata.ocrUsed, false);
  assert.equal(ocrCalled, false, "the OCR provider must never be invoked for a readable native PDF");
  assert.ok(result.text.includes("perfectly readable"));
  console.log("PASS native readable PDF -> method native, OCR never invoked");
}

/** 2. Fully scanned PDF (empty native text): OCR must run and its recognized text must be used. */
async function testScannedPdfUsesOcr(): Promise<void> {
  const result = await extractDocumentText(Buffer.from("fake-pdf-bytes"), {
    parseNativeText: fakeNativeParser({ text: "", pageCount: 1 }),
    renderPdfPagesToImages: fakeRenderer([fakePage(1)]),
    ocrProvider: fakeOcrProvider([{ pageNumber: 1, text: GOOD_OCR_TEXT, confidence: 92, durationMs: 20 }]),
  });

  assert.equal(result.method, "ocr");
  assert.equal(result.metadata.ocrUsed, true);
  assert.ok(result.text.includes("--- PAGE 1 ---"));
  assert.ok(result.text.includes("OCR-recognized"));
  console.log("PASS fully scanned PDF -> OCR runs, method ocr, recognized text used");
}

/** 3. OCR disabled + a scanned PDF -> a clear OCR_DISABLED error, never silently falling back to empty text. */
async function testOcrDisabledOnScannedPdf(): Promise<void> {
  await assert.rejects(
    () =>
      extractDocumentText(Buffer.from("fake-pdf-bytes"), {
        parseNativeText: fakeNativeParser({ text: "", pageCount: 1 }),
        config: { ...DEFAULT_OCR_RUNTIME_CONFIG, enabled: false },
      }),
    (error: unknown) => {
      assert.ok(error instanceof DocumentOcrError);
      assert.equal(error.code, "OCR_DISABLED");
      return true;
    },
  );
  console.log("PASS OCR disabled on a scanned PDF -> OCR_DISABLED");
}

/** 6. Page limit: a document whose page count exceeds OCR_MAX_PAGES must fail clearly rather than process an unbounded number of pages. */
async function testPageLimitExceeded(): Promise<void> {
  await assert.rejects(
    () =>
      extractDocumentText(Buffer.from("fake-pdf-bytes"), {
        parseNativeText: fakeNativeParser({ text: "", pageCount: 50 }),
        config: { ...DEFAULT_OCR_RUNTIME_CONFIG, maxPages: 30 },
      }),
    (error: unknown) => {
      assert.ok(error instanceof DocumentOcrError);
      assert.equal(error.code, "OCR_PAGE_LIMIT_EXCEEDED");
      return true;
    },
  );
  console.log("PASS page count over OCR_MAX_PAGES -> OCR_PAGE_LIMIT_EXCEEDED");
}

/** 7. Partial page failure: one page fails, one succeeds — the document must not fail outright, the failure must be recorded, and only the successful page's text is used. */
async function testPartialPageFailureIsTolerated(): Promise<void> {
  const result = await extractDocumentText(Buffer.from("fake-pdf-bytes"), {
    parseNativeText: fakeNativeParser({ text: "", pageCount: 2 }),
    renderPdfPagesToImages: fakeRenderer([fakePage(1), fakePage(2)]),
    ocrProvider: fakeOcrProvider([
      { pageNumber: 1, text: GOOD_OCR_TEXT, confidence: 90, durationMs: 20 },
      { pageNumber: 2, text: "", durationMs: 5, warning: "page 2 timed out" },
    ]),
  });

  assert.equal(result.method, "ocr");
  assert.equal(result.metadata.processedPages, 1);
  assert.equal(result.metadata.skippedPages, 1);
  assert.ok(result.warnings.some((warning) => warning.startsWith("[OCR_PAGE_FAILED]")));
  console.log("PASS one page fails, one succeeds -> tolerated, successful page's text used");
}

/** Corrupted/unparseable PDF: the native parser's own failure must still surface as a clear error, not an unhandled crash. */
async function testCorruptedPdfSurfacesCleanError(): Promise<void> {
  await assert.rejects(
    () =>
      extractDocumentText(Buffer.from("fake-pdf-bytes"), {
        parseNativeText: async () => {
          throw new Error("Failed to parse PDF — the file may be corrupted or password-protected");
        },
      }),
    /corrupted or password-protected/,
  );
  console.log("PASS corrupted/unparseable PDF -> clean error, not an unhandled crash");
}

export async function run(): Promise<void> {
  await testNativeReadablePdfSkipsOcr();
  await testScannedPdfUsesOcr();
  await testOcrDisabledOnScannedPdf();
  await testPageLimitExceeded();
  await testPartialPageFailureIsTolerated();
  await testCorruptedPdfSurfacesCleanError();

  console.log("PASS documentParser.test.ts");
}

run();
