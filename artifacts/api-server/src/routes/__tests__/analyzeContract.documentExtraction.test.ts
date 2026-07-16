import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { handleAnalyzeContract, type AnalyzeContractHandlerDeps } from "../analyzeContract";
import { DocumentOcrError, ocrDisabledError, type DocumentExtractionResult } from "@workspace/document-ocr";
import { maskPii } from "../../services/piiMasker";
import type { ContractUnderstanding } from "@workspace/contract-schema";
import type { FinancialMetrics } from "@workspace/financial-metrics";

function createMockReq(body: Record<string, unknown>): Request {
  return {
    file: { buffer: Buffer.from("not a real pdf"), originalname: "test.pdf" },
    body,
    log: { warn() {}, error() {}, info() {} },
  } as unknown as Request;
}

function createMockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

const FAKE_ANALYSIS_RESULT: ContractUnderstanding = {
  contractType: "auto_finance",
  contractSummary: "Contract summary.",
  contractSummarySimple: "Simple contract summary.",
  parties: [],
  financialObligations: [],
  dates: [],
  penalties: [],
  fees: [],
  importantClauses: [],
  extractedNumbers: [],
  missingInformation: [],
  extractionNotes: null,
  typeDetails: {
    contractType: "auto_finance",
    vehicleMake: null,
    vehicleModel: null,
    vehicleYear: null,
    financedAmount: null,
    downPayment: null,
    interestRate: null,
    loanTermMonths: null,
    monthlyInstallment: null,
    balloonPayment: null,
  },
};

async function fakeIndexContractRagSession() {
  return { sessionId: "fake-session-id" };
}

function baseDeps(extraction: DocumentExtractionResult, overrides: Partial<AnalyzeContractHandlerDeps> = {}): AnalyzeContractHandlerDeps {
  return {
    async extractDocumentText() {
      return extraction;
    },
    maskPii,
    async analyzeContract(): Promise<ContractUnderstanding> {
      return FAKE_ANALYSIS_RESULT;
    },
    calculateFinancialMetrics(): FinancialMetrics {
      return { schemaVersion: "1.0" } as unknown as FinancialMetrics;
    },
    indexContractRagSession: fakeIndexContractRagSession,
    ...overrides,
  };
}

/** 1/2. The response's `documentExtraction` object must faithfully mirror the engine's result — method, quality, counters — for both the native and OCR paths. */
async function testDocumentExtractionMetadataInResponse(): Promise<void> {
  const nativeExtraction: DocumentExtractionResult = {
    method: "native",
    text: "Native contract text",
    pageCount: 3,
    quality: "good",
    warnings: [],
    metadata: { ocrUsed: false, processedPages: 3, skippedPages: 0, durationMs: 42 },
  };

  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();
  await handleAnalyzeContract(req, res, baseDeps(nativeExtraction));

  const body = res.body as { success: boolean; documentExtraction: Record<string, unknown> };
  assert.equal(body.success, true);
  assert.deepEqual(body.documentExtraction, {
    method: "native",
    pageCount: 3,
    quality: "good",
    warnings: [],
    ocrUsed: false,
    durationMs: 42,
    processedPages: 3,
    skippedPages: 0,
  });
  console.log("PASS documentExtraction metadata (native) present in response with the correct shape");

  const ocrExtraction: DocumentExtractionResult = {
    method: "ocr",
    text: "--- PAGE 1 ---\nOCR text here",
    pageCount: 1,
    quality: "good",
    warnings: ["[LOW_TEXT_DENSITY] example"],
    metadata: {
      ocrUsed: true,
      processedPages: 1,
      skippedPages: 0,
      durationMs: 48215,
      languages: ["ara", "eng"],
      nativeQualityScore: 10,
      ocrQualityScore: 88,
    },
  };
  const req2 = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res2 = createMockRes();
  await handleAnalyzeContract(req2, res2, baseDeps(ocrExtraction));

  const body2 = res2.body as { documentExtraction: Record<string, unknown> };
  assert.equal(body2.documentExtraction.method, "ocr");
  assert.equal(body2.documentExtraction.ocrUsed, true);
  assert.deepEqual(body2.documentExtraction.languages, ["ara", "eng"]);
  console.log("PASS documentExtraction metadata (ocr) present in response with the correct shape");
}

/** 9. PII masking after OCR: the masker must run on the OCR-derived text, and only the masked text (never raw) may reach the AI stage. */
async function testPiiMaskingRunsOnOcrDerivedText(): Promise<void> {
  const rawOcrText =
    "National ID 1234567890, Iqama 2234567890, IBAN SA0380000000608010167519, phone 0512345678, email test@example.com, account 123456789012.";
  const ocrExtraction: DocumentExtractionResult = {
    method: "ocr",
    text: rawOcrText,
    pageCount: 1,
    quality: "good",
    warnings: [],
    metadata: { ocrUsed: true, processedPages: 1, skippedPages: 0, durationMs: 100 },
  };

  let capturedAnalyzeArgs: unknown[] = [];
  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();

  await handleAnalyzeContract(
    req,
    res,
    baseDeps(ocrExtraction, {
      async analyzeContract(...args: unknown[]): Promise<ContractUnderstanding> {
        capturedAnalyzeArgs = args;
        return FAKE_ANALYSIS_RESULT;
      },
    }),
  );

  const [maskedTextArg] = capturedAnalyzeArgs as [string];
  assert.equal(maskedTextArg.includes("1234567890"), false, "the national ID must be masked before reaching AI");
  assert.equal(maskedTextArg.includes("SA0380000000608010167519"), false, "the IBAN must be masked before reaching AI");
  assert.equal(maskedTextArg.includes("0512345678"), false, "the phone number must be masked before reaching AI");
  assert.equal(maskedTextArg.includes("test@example.com"), false, "the email must be masked before reaching AI");
  assert.ok(maskedTextArg.includes("[NATIONAL_ID]"));
  assert.ok(maskedTextArg.includes("[IBAN]"));
  assert.ok(maskedTextArg.includes("[PHONE]"));
  assert.ok(maskedTextArg.includes("[EMAIL]"));

  const body = res.body as { piiStatistics: Record<string, number> };
  assert.ok(body.piiStatistics.nationalIds >= 1);
  assert.ok(body.piiStatistics.ibans >= 1);
  console.log("PASS PII masking runs on OCR-derived text; only masked text reaches the AI stage");
}

/** A DocumentOcrError (e.g. OCR_DISABLED) must surface as a structured 422 response with a `code`, never an unhandled crash. */
async function testDocumentOcrErrorSurfacesWithCode(): Promise<void> {
  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();

  const deps: AnalyzeContractHandlerDeps = {
    async extractDocumentText() {
      throw ocrDisabledError();
    },
    maskPii,
    async analyzeContract(): Promise<ContractUnderstanding> {
      throw new Error("must not be reached");
    },
    calculateFinancialMetrics(): FinancialMetrics {
      throw new Error("must not be reached");
    },
    indexContractRagSession: fakeIndexContractRagSession,
  };

  await handleAnalyzeContract(req, res, deps);

  assert.equal(res.statusCode, 422);
  const body = res.body as { success: boolean; code?: string };
  assert.equal(body.success, false);
  assert.equal(body.code, "OCR_DISABLED");
  console.log("PASS OCR_DISABLED (or any DocumentOcrError) surfaces as a 422 with a structured code");
}

/** Non-DocumentOcrError failures (e.g. a plain Error from a corrupted PDF) must keep the pre-existing 422 shape without a `code` field. */
async function testPlainErrorHasNoCodeField(): Promise<void> {
  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();

  const deps: AnalyzeContractHandlerDeps = {
    async extractDocumentText() {
      throw new Error("Failed to parse PDF — the file may be corrupted or password-protected");
    },
    maskPii,
    async analyzeContract(): Promise<ContractUnderstanding> {
      throw new Error("must not be reached");
    },
    calculateFinancialMetrics(): FinancialMetrics {
      throw new Error("must not be reached");
    },
    indexContractRagSession: fakeIndexContractRagSession,
  };

  await handleAnalyzeContract(req, res, deps);

  assert.equal(res.statusCode, 422);
  const body = res.body as { success: boolean; code?: string; message: string };
  assert.equal(body.success, false);
  assert.equal(body.code, undefined, "a plain Error must not fabricate a code field");
  assert.ok(body.message.includes("corrupted"));
  console.log("PASS a plain Error keeps the pre-existing 422 shape (no code field)");
}

/**
 * Financial OCR hardening wiring: `documentExtraction`'s optional financial
 * fields must reach the response when present, and the document extraction's
 * `recoveredFinancialValues` must be forwarded to `analyzeContract` as
 * `options.recoveryNotes` (so the AI prompt can include the deterministic
 * recovery notes) — without ever appearing in the response as an existing
 * required field, since this is all additive/optional metadata.
 */
async function testFinancialRecoveryMetadataAndPromptWiring(): Promise<void> {
  const recoveredValues = [
    {
      field: "cashPrice" as const,
      value: 120000,
      unit: "SAR" as const,
      status: "recovered" as const,
      confidence: "high" as const,
      source: "amount_words" as const,
      evidence: ['label "السعر النقدي" + amount-in-words "مائة وعشرون ألف ريال"'],
      warnings: [],
    },
  ];

  const extraction: DocumentExtractionResult = {
    method: "ocr",
    text: "--- PAGE 1 ---\nالسعر النقدي 0 ريال (مائة وعشرون ألف ريال)",
    pageCount: 1,
    quality: "good",
    warnings: [],
    recoveredFinancialValues: recoveredValues,
    metadata: {
      ocrUsed: true,
      processedPages: 1,
      skippedPages: 0,
      durationMs: 500,
      financialQuality: "good",
      financialQualityScore: 100,
      recoveredFinancialValues: 1,
      selectedOcrCandidate: "preprocessed",
    },
  };

  let capturedAnalyzeArgs: unknown[] = [];
  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();

  await handleAnalyzeContract(
    req,
    res,
    baseDeps(extraction, {
      async analyzeContract(...args: unknown[]): Promise<ContractUnderstanding> {
        capturedAnalyzeArgs = args;
        return FAKE_ANALYSIS_RESULT;
      },
    }),
  );

  const body = res.body as { documentExtraction: Record<string, unknown> };
  assert.equal(body.documentExtraction.financialQuality, "good");
  assert.equal(body.documentExtraction.financialQualityScore, 100);
  assert.equal(body.documentExtraction.recoveredFinancialValues, 1);
  assert.equal(body.documentExtraction.selectedOcrCandidate, "preprocessed");

  const [, , , analyzeOptions] = capturedAnalyzeArgs as [string, string, string, { recoveryNotes?: unknown }];
  assert.deepEqual(analyzeOptions.recoveryNotes, recoveredValues, "the recovered values must be forwarded as recoveryNotes to analyzeContract");

  console.log("PASS financial recovery metadata reaches the response and recoveryNotes reaches analyzeContract");
}

/** Privacy: raw/masked text previews must never be present in a production response, regardless of native or OCR origin. */
async function testRawTextPreviewsAbsentInProduction(): Promise<void> {
  const extraction: DocumentExtractionResult = {
    method: "ocr",
    text: "Some contract text with a national ID 1234567890 in it",
    pageCount: 1,
    quality: "good",
    warnings: [],
    metadata: { ocrUsed: true, processedPages: 1, skippedPages: 0, durationMs: 10 },
  };

  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
    const res = createMockRes();
    await handleAnalyzeContract(req, res, baseDeps(extraction));

    const body = res.body as Record<string, unknown>;
    assert.equal(body.textPreview, undefined, "textPreview must be absent in production");
    assert.equal(body.maskedTextPreview, undefined, "maskedTextPreview must be absent in production");
    assert.equal(body._dev_rawText, undefined, "_dev_rawText must be absent in production");
    assert.equal(body._dev_maskedText, undefined, "_dev_maskedText must be absent in production");
    assert.equal(JSON.stringify(body).includes("1234567890"), false, "no raw contract content may leak into a production response");
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }
  console.log("PASS raw/masked text previews are absent from a production response");
}

export async function run(): Promise<void> {
  await testDocumentExtractionMetadataInResponse();
  await testPiiMaskingRunsOnOcrDerivedText();
  await testFinancialRecoveryMetadataAndPromptWiring();
  await testDocumentOcrErrorSurfacesWithCode();
  await testPlainErrorHasNoCodeField();
  await testRawTextPreviewsAbsentInProduction();

  console.log("PASS analyzeContract.documentExtraction.test.ts");
}

run();
