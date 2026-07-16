import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { handleAnalyzeContract, type AnalyzeContractHandlerDeps } from "../analyzeContract";
import type { DocumentExtractionResult } from "@workspace/document-ocr";
import type { MaskedDocument, PiiStatistics } from "../../services/piiMasker";
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

const FAKE_EXTRACTION: DocumentExtractionResult = {
  method: "native",
  text: "raw pdf text with a national id 1234567890",
  pageCount: 1,
  quality: "good",
  warnings: [],
  metadata: { ocrUsed: false, processedPages: 1, skippedPages: 0, durationMs: 5 },
};

const FAKE_MASKED_TEXT = "Masked contract body with [NATIONAL_ID], unique-marker-9f21.";

const EMPTY_PII_STATISTICS: PiiStatistics = {
  names: 0,
  nationalIds: 1,
  iqamaNumbers: 0,
  commercialRegistrations: 0,
  phones: 0,
  emails: 0,
  ibans: 0,
  bankAccounts: 0,
};

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

function baseDeps(overrides: Partial<AnalyzeContractHandlerDeps> = {}): AnalyzeContractHandlerDeps {
  return {
    async extractDocumentText(): Promise<DocumentExtractionResult> {
      return FAKE_EXTRACTION;
    },
    maskPii(): MaskedDocument {
      return { maskedText: FAKE_MASKED_TEXT, statistics: EMPTY_PII_STATISTICS };
    },
    async analyzeContract(): Promise<ContractUnderstanding> {
      return FAKE_ANALYSIS_RESULT;
    },
    calculateFinancialMetrics(): FinancialMetrics {
      return { schemaVersion: "1.0" } as unknown as FinancialMetrics;
    },
    async indexContractRagSession() {
      return { sessionId: "fake-session-id" };
    },
    ...overrides,
  };
}

/** 1. A successful Contract RAG index surfaces the optional session id, with a null error. */
async function testSuccessfulIndexingReturnsSessionId(): Promise<void> {
  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();

  await handleAnalyzeContract(req, res, baseDeps());

  const body = res.body as { success: boolean; contractRagSessionId: string | null; contractRagError: string | null };
  assert.equal(body.success, true);
  assert.equal(body.contractRagSessionId, "fake-session-id");
  assert.equal(body.contractRagError, null);
  console.log("PASS a successful Contract RAG index returns the session id with a null error");
}

/** 2. A Contract RAG indexing failure must never fail the whole upload/analysis — analysis must still be returned. */
async function testIndexingFailureDegradesGracefully(): Promise<void> {
  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();

  await handleAnalyzeContract(
    req,
    res,
    baseDeps({
      async indexContractRagSession() {
        throw new Error("internal database connection string exposed: postgres://user:pass@host/db, stack trace at pipeline/x.ts:42");
      },
    }),
  );

  assert.equal(res.statusCode, 200, "a Contract RAG indexing failure must not become an HTTP error");
  const body = res.body as {
    success: boolean;
    analysis: { contractType: string };
    contractRagSessionId: string | null;
    contractRagError: string | null;
  };
  assert.equal(body.success, true, "the response must remain a successful (partial-success) response");
  assert.ok(body.analysis, "the valid analysis must be preserved even when Contract RAG indexing fails");
  assert.equal(body.contractRagSessionId, null);
  assert.equal(body.contractRagError, "CONTRACT_RAG_UNAVAILABLE");

  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes("postgres://"), false, "the response must never expose an internal database error/connection string");
  assert.equal(serialized.includes("stack trace"), false, "the response must never expose internal error details");
  console.log("PASS a Contract RAG indexing failure degrades gracefully: analysis still returned, bounded error code only");
}

/** 3. Contract RAG indexing must run even when the AI analysis stage itself fails — the two are independent. */
async function testIndexingRunsIndependentlyOfAnalysisFailure(): Promise<void> {
  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();

  await handleAnalyzeContract(
    req,
    res,
    baseDeps({
      async analyzeContract(): Promise<ContractUnderstanding> {
        throw new Error("AI analysis failed");
      },
    }),
  );

  const body = res.body as { success: boolean; analysis: unknown; contractRagSessionId: string | null; contractRagError: string | null };
  assert.equal(body.success, true);
  assert.equal(body.analysis, null, "analysis must be null when the AI stage fails");
  assert.equal(body.contractRagSessionId, "fake-session-id", "Contract RAG indexing must still succeed independently of the AI analysis stage");
  assert.equal(body.contractRagError, null);
  console.log("PASS Contract RAG indexing succeeds independently even when AI analysis fails");
}

/** 4. Only the masked text (never the raw extracted text) is ever passed to Contract RAG indexing. */
async function testOnlyMaskedTextReachesIndexing(): Promise<void> {
  let capturedMaskedDocument: unknown;
  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();

  await handleAnalyzeContract(
    req,
    res,
    baseDeps({
      async indexContractRagSession(maskedDocument) {
        capturedMaskedDocument = maskedDocument;
        return { sessionId: "fake-session-id" };
      },
    }),
  );

  const captured = capturedMaskedDocument as { maskedText: string } | undefined;
  assert.ok(captured);
  assert.equal(captured.maskedText, FAKE_MASKED_TEXT, "Contract RAG indexing must receive exactly the masked text, never the raw extracted text");
  assert.equal(captured.maskedText.includes("1234567890"), false, "the raw national id must never reach Contract RAG indexing");
  console.log("PASS Contract RAG indexing receives only the masked text, never raw extracted text");
}

export async function run(): Promise<void> {
  await testSuccessfulIndexingReturnsSessionId();
  await testIndexingFailureDegradesGracefully();
  await testIndexingRunsIndependentlyOfAnalysisFailure();
  await testOnlyMaskedTextReachesIndexing();

  console.log("PASS analyzeContract.contractRag.test.ts");
}

run();
