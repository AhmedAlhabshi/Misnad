import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { DEFAULT_OCR_RUNTIME_CONFIG, type OcrRuntimeConfig } from "../config";
import { DocumentOcrError } from "../errors";
import { runOcrFallbackPipeline, type OcrFallbackDeps } from "../runOcrFallbackPipeline";
import type { OcrPageResult, OcrProvider, RenderedPdfPage } from "../types";
import type { RenderPdfPagesResult } from "../pdfPageRenderer";

function fakeRenderer(
  pagesToProduce: readonly RenderedPdfPage[],
  failedPageNumbers: readonly number[] = [],
): typeof import("../pdfPageRenderer").renderPdfPagesToImages {
  return async (): Promise<RenderPdfPagesResult> => ({
    pages: [...pagesToProduce],
    failedPageNumbers: [...failedPageNumbers],
  });
}

function fakePage(pageNumber: number): RenderedPdfPage {
  return { pageNumber, png: Buffer.from(`fake-png-${pageNumber}`), width: 100, height: 100 };
}

function fakeOcrProvider(pageResults: readonly OcrPageResult[]): OcrProvider {
  return {
    async recognizePages(): Promise<OcrPageResult[]> {
      return [...pageResults];
    },
  };
}

/** An OCR provider that never resolves before the overall timeout — used to prove OCR_TIMEOUT fires and cleans up promptly. */
function hangingOcrProvider(): OcrProvider {
  return {
    recognizePages(_pages, options) {
      return new Promise((resolve) => {
        options.signal?.addEventListener("abort", () => resolve([]));
      });
    },
  };
}

interface BuildDepsOverrides {
  config?: Partial<OcrRuntimeConfig>;
  ocrProvider?: OcrProvider;
  renderPdfPagesToImages?: OcrFallbackDeps["renderPdfPagesToImages"];
  onEvent?: OcrFallbackDeps["onEvent"];
}

function buildDeps(overrides: BuildDepsOverrides = {}): OcrFallbackDeps {
  return {
    config: { ...DEFAULT_OCR_RUNTIME_CONFIG, ...overrides.config },
    ocrProvider: overrides.ocrProvider ?? fakeOcrProvider([]),
    renderPdfPagesToImages: overrides.renderPdfPagesToImages ?? fakeRenderer([]),
    onEvent: overrides.onEvent,
  };
}

const GOOD_NATIVE_TEXT =
  "This is a perfectly readable native contract text with plenty of real words describing the agreement terms and financial obligations in detail.".repeat(
    3,
  );
const POOR_NATIVE_TEXT = "   ";

async function testNativeGoodSkipsOcr(): Promise<void> {
  let ocrProviderCalled = false;
  const deps = buildDeps({
    ocrProvider: {
      async recognizePages() {
        ocrProviderCalled = true;
        return [];
      },
    },
  });

  const result = await runOcrFallbackPipeline({ buffer: Buffer.from(""), nativeText: GOOD_NATIVE_TEXT, nativePageCount: 1 }, deps);

  assert.equal(result.method, "native");
  assert.equal(result.metadata.ocrUsed, false);
  assert.equal(ocrProviderCalled, false, "the OCR provider must never be invoked for good-quality native text");
  console.log("PASS native good text -> method native, OCR provider never called");
}

async function testPoorNativeUsesBetterOcrResult(): Promise<void> {
  const ocrText =
    "This is the OCR-recognized text, which is long, clean, and reads as genuine contract prose describing obligations.".repeat(
      3,
    );
  const deps = buildDeps({
    renderPdfPagesToImages: fakeRenderer([fakePage(1)]),
    ocrProvider: fakeOcrProvider([{ pageNumber: 1, text: ocrText, confidence: 90, durationMs: 10 }]),
  });

  const result = await runOcrFallbackPipeline({ buffer: Buffer.from(""), nativeText: POOR_NATIVE_TEXT, nativePageCount: 1 }, deps);

  assert.equal(result.method, "ocr");
  assert.equal(result.metadata.ocrUsed, true);
  assert.ok(result.text.includes("--- PAGE 1 ---"), "merged OCR text must include the page separator");
  assert.ok(result.text.includes("OCR-recognized"));
  assert.equal(
    result.warnings.some((warning) => warning.startsWith("[TEXT_TOO_SHORT]")),
    false,
    "a resolved native-extraction warning must not linger once OCR replaces the returned text",
  );
  console.log("PASS poor native text + good OCR -> method ocr, page separator present, stale native warning dropped");
}

async function testFinancialRecoveryWiredIntoResult(): Promise<void> {
  const ocrText =
    "السعر النقدي 0 ريال (مائة وعشرون ألف ريال)\nالدفعة الأولى 24000 ريال\n" +
    "padding text describing unrelated contract clauses padding text describing unrelated contract clauses".repeat(3);
  const deps = buildDeps({
    renderPdfPagesToImages: fakeRenderer([fakePage(1)]),
    ocrProvider: fakeOcrProvider([{ pageNumber: 1, text: ocrText, confidence: 90, durationMs: 10 }]),
  });

  const result = await runOcrFallbackPipeline({ buffer: Buffer.from(""), nativeText: POOR_NATIVE_TEXT, nativePageCount: 1 }, deps);

  assert.equal(result.method, "ocr");
  assert.ok(result.recoveredFinancialValues, "recoveredFinancialValues must be populated on the result");
  const cashPrice = result.recoveredFinancialValues!.find((value) => value.field === "cashPrice");
  assert.equal(cashPrice?.value, 120000, "the corrupted '0' must be recovered from the parenthetical amount-in-words");
  assert.equal(cashPrice?.status, "recovered");
  assert.ok(result.metadata.recoveredFinancialValues !== undefined && result.metadata.recoveredFinancialValues >= 1);
  assert.notEqual(result.metadata.financialQuality, undefined, "financialQuality must be populated when financial labels are present");
  console.log("PASS financial recovery is wired into the final result and its metadata");
}

/** A tiny but genuinely valid PNG, needed here (unlike other tests' plain-text fake buffers) because this test enables preprocessing, which really decodes the image via `@napi-rs/canvas`. */
async function buildRealPagePng(): Promise<Buffer> {
  const canvas = createCanvas(20, 20);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, 20, 20);
  return canvas.encode("png");
}

async function testCandidateSelectionPrefersFinanciallyCorrectResult(): Promise<void> {
  const realPng = await buildRealPagePng();
  const page: RenderedPdfPage = { pageNumber: 1, png: realPng, width: 20, height: 20 };

  const paddingProse =
    "padding text describing unrelated contract clauses padding text describing unrelated contract clauses".repeat(3);
  const corruptedText = `السعر النقدي 0 ريال\nالدفعة الأولى 9620 0 ريال\n${paddingProse}`;
  const correctText = `السعر النقدي 120000 ريال\nالدفعة الأولى 24000 ريال\n${paddingProse}`;

  let callCount = 0;
  const events: Array<{ event: string; meta: Record<string, unknown> }> = [];

  const deps = buildDeps({
    config: { preprocessingEnabled: true },
    renderPdfPagesToImages: async () => ({ pages: [page], failedPageNumbers: [] }),
    ocrProvider: {
      async recognizePages(): Promise<OcrPageResult[]> {
        callCount += 1;
        // The "original" pass reads confidently but corrupts the financial
        // digits; the "preprocessed" pass reads with lower raw confidence
        // but gets the numbers right — selection must not just follow
        // confidence.
        const isFirstCall = callCount === 1;
        return [
          {
            pageNumber: 1,
            text: isFirstCall ? corruptedText : correctText,
            confidence: isFirstCall ? 95 : 60,
            durationMs: 5,
          },
        ];
      },
    },
    onEvent: (event, meta) => events.push({ event, meta }),
  });

  const result = await runOcrFallbackPipeline({ buffer: Buffer.from(""), nativeText: POOR_NATIVE_TEXT, nativePageCount: 1 }, deps);

  assert.equal(callCount, 2, "both the original and preprocessed candidates must be recognized");
  assert.equal(result.metadata.selectedOcrCandidate, "preprocessed");
  assert.ok(result.text.includes("120000"), "the financially-correct (preprocessed) candidate's text must be the one returned");
  assert.ok(events.some((event) => event.event === "document_ocr_candidate_selected"));
  console.log("PASS candidate selection prefers the financially-correct result over the confidently-corrupted one");
}

async function testOcrDisabledThrows(): Promise<void> {
  const deps = buildDeps({ config: { enabled: false } });

  await assert.rejects(
    () => runOcrFallbackPipeline({ buffer: Buffer.from(""), nativeText: POOR_NATIVE_TEXT, nativePageCount: 1 }, deps),
    (error: unknown) => {
      assert.ok(error instanceof DocumentOcrError);
      assert.equal(error.code, "OCR_DISABLED");
      return true;
    },
  );
  console.log("PASS OCR disabled + poor native text -> OCR_DISABLED");
}

async function testPageLimitExceededThrows(): Promise<void> {
  const deps = buildDeps({ config: { maxPages: 5 } });

  await assert.rejects(
    () => runOcrFallbackPipeline({ buffer: Buffer.from(""), nativeText: POOR_NATIVE_TEXT, nativePageCount: 10 }, deps),
    (error: unknown) => {
      assert.ok(error instanceof DocumentOcrError);
      assert.equal(error.code, "OCR_PAGE_LIMIT_EXCEEDED");
      return true;
    },
  );
  console.log("PASS page count over OCR_MAX_PAGES -> OCR_PAGE_LIMIT_EXCEEDED");
}

async function testTimeoutThrows(): Promise<void> {
  const deps = buildDeps({
    config: { timeoutMs: 50 },
    renderPdfPagesToImages: fakeRenderer([fakePage(1)]),
    ocrProvider: hangingOcrProvider(),
  });

  const startedAt = Date.now();
  await assert.rejects(
    () => runOcrFallbackPipeline({ buffer: Buffer.from(""), nativeText: POOR_NATIVE_TEXT, nativePageCount: 1 }, deps),
    (error: unknown) => {
      assert.ok(error instanceof DocumentOcrError);
      assert.equal(error.code, "OCR_TIMEOUT");
      return true;
    },
  );
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 5000, `the timeout must fire promptly (took ${elapsed}ms), never hang indefinitely`);
  console.log("PASS OCR exceeding the overall timeout -> OCR_TIMEOUT, resolved promptly");
}

async function testPartialPageFailureKeepsSuccessfulPages(): Promise<void> {
  const goodText =
    "The successful page recognized real contract prose with plenty of genuine words describing the terms in full detail.".repeat(
      3,
    );
  const deps = buildDeps({
    renderPdfPagesToImages: fakeRenderer([fakePage(1), fakePage(2)]),
    ocrProvider: fakeOcrProvider([
      { pageNumber: 1, text: goodText, confidence: 88, durationMs: 10 },
      { pageNumber: 2, text: "", durationMs: 5, warning: "page 2 timed out" },
    ]),
  });

  const result = await runOcrFallbackPipeline({ buffer: Buffer.from(""), nativeText: POOR_NATIVE_TEXT, nativePageCount: 2 }, deps);

  assert.equal(result.method, "ocr");
  assert.ok(result.text.includes("--- PAGE 1 ---"));
  assert.equal(result.text.includes("--- PAGE 2 ---"), false, "a failed page must not contribute a page section");
  assert.equal(result.metadata.processedPages, 1);
  assert.equal(result.metadata.skippedPages, 1);
  assert.ok(result.warnings.some((warning) => warning.startsWith("[OCR_PAGE_FAILED]")));
  console.log("PASS one page fails, one succeeds -> successful page kept, warning recorded, quality evaluated on survivors");
}

async function testOcrWorseThanNativeKeepsNative(): Promise<void> {
  // A "partial" native text (score 50, shouldUseOcr=true) that still beats an even-worse-scoring (43) OCR result — neither lands in "poor", so this exercises the score comparison rather than the both-poor rejection.
  const mediocreNativeText = "Amount ▓▓▓ SAR ◆◆◆ terms ●●●";
  const badOcrText = "▓▓▓▓▓ ◆◆◆◆◆ ●●●●● ▲▲▲▲▲ ■■■■■ ♦♦♦♦♦";
  const deps = buildDeps({
    renderPdfPagesToImages: fakeRenderer([fakePage(1)]),
    ocrProvider: fakeOcrProvider([{ pageNumber: 1, text: badOcrText, confidence: 20, durationMs: 10 }]),
  });

  const result = await runOcrFallbackPipeline(
    { buffer: Buffer.from(""), nativeText: mediocreNativeText, nativePageCount: 1 },
    deps,
  );

  assert.equal(result.method, "native", "the higher-scoring native text must win over a lower-scoring OCR result");
  assert.equal(result.metadata.ocrUsed, false);
  assert.ok(result.warnings.some((warning) => warning.startsWith("[OCR_LOW_QUALITY]")));
  console.log("PASS OCR result worse than native -> native text kept with OCR_LOW_QUALITY warning");
}

async function testBothPoorThrowsUnreadable(): Promise<void> {
  const deps = buildDeps({
    renderPdfPagesToImages: fakeRenderer([fakePage(1)]),
    ocrProvider: fakeOcrProvider([{ pageNumber: 1, text: "", durationMs: 5, warning: "page 1 failed" }]),
  });

  await assert.rejects(
    () => runOcrFallbackPipeline({ buffer: Buffer.from(""), nativeText: POOR_NATIVE_TEXT, nativePageCount: 1 }, deps),
    (error: unknown) => {
      assert.ok(error instanceof DocumentOcrError);
      assert.equal(error.code, "DOCUMENT_TEXT_UNREADABLE");
      return true;
    },
  );
  console.log("PASS both native and OCR unusable -> DOCUMENT_TEXT_UNREADABLE, never forwards garbage text");
}

async function testDiagnosticEventsNeverIncludeText(): Promise<void> {
  const events: Array<{ event: string; meta: Record<string, unknown> }> = [];
  const ocrText = "Recognized secret contract clause with a sensitive amount of 999999 SAR repeated for length".repeat(3);
  const deps = buildDeps({
    renderPdfPagesToImages: fakeRenderer([fakePage(1)]),
    ocrProvider: fakeOcrProvider([{ pageNumber: 1, text: ocrText, confidence: 91, durationMs: 10 }]),
    onEvent: (event, meta) => events.push({ event, meta }),
  });

  await runOcrFallbackPipeline({ buffer: Buffer.from(""), nativeText: POOR_NATIVE_TEXT, nativePageCount: 1 }, deps);

  assert.ok(events.length > 0);
  const serializedEvents = JSON.stringify(events);
  assert.equal(serializedEvents.includes("Recognized secret contract clause"), false, "diagnostic events must never include recognized text content");
  assert.equal(serializedEvents.includes("999999"), false, "diagnostic events must never include amounts from the document");
  console.log("PASS diagnostic events carry only safe metadata, never document text");
}

export async function run(): Promise<void> {
  await testNativeGoodSkipsOcr();
  await testPoorNativeUsesBetterOcrResult();
  await testFinancialRecoveryWiredIntoResult();
  await testCandidateSelectionPrefersFinanciallyCorrectResult();
  await testOcrDisabledThrows();
  await testPageLimitExceededThrows();
  await testTimeoutThrows();
  await testPartialPageFailureKeepsSuccessfulPages();
  await testOcrWorseThanNativeKeepsNative();
  await testBothPoorThrowsUnreadable();
  await testDiagnosticEventsNeverIncludeText();

  console.log("PASS runOcrFallbackPipeline.test.ts");
}

run();
