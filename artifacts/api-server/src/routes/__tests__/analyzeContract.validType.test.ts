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
    log: { warn() {}, info() {} },
  } as unknown as Request;
}

const FAKE_EXTRACTION: DocumentExtractionResult = {
  method: "native",
  text: "raw pdf text",
  pageCount: 1,
  quality: "good",
  warnings: [],
  metadata: { ocrUsed: false, processedPages: 1, skippedPages: 0, durationMs: 5 },
};

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

const FAKE_MASKED_TEXT = "Masked auto finance contract body, unique-marker-7a2f19.";

const EMPTY_PII_STATISTICS: PiiStatistics = {
  names: 0,
  nationalIds: 0,
  iqamaNumbers: 0,
  commercialRegistrations: 0,
  phones: 0,
  emails: 0,
  ibans: 0,
  bankAccounts: 0,
};

const FAKE_ANALYSIS_RESULT: ContractUnderstanding = {
  contractType: "auto_finance",
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

const FAKE_FINANCIAL_METRICS = { schemaVersion: "1.0", fake: true } as unknown as FinancialMetrics;

export async function run(): Promise<void> {
  let parseCallCount = 0;
  let maskCallCount = 0;
  let analyzeCallCount = 0;
  let financialMetricsCallCount = 0;
  let capturedArgs: unknown[] = [];
  let capturedFinancialMetricsArgs: unknown[] = [];

  const deps: AnalyzeContractHandlerDeps = {
    async extractDocumentText(): Promise<DocumentExtractionResult> {
      parseCallCount += 1;
      return FAKE_EXTRACTION;
    },
    maskPii(): MaskedDocument {
      maskCallCount += 1;
      return { maskedText: FAKE_MASKED_TEXT, statistics: EMPTY_PII_STATISTICS };
    },
    async analyzeContract(...args: unknown[]): Promise<ContractUnderstanding> {
      analyzeCallCount += 1;
      capturedArgs = args;
      return FAKE_ANALYSIS_RESULT;
    },
    calculateFinancialMetrics(...args: unknown[]): FinancialMetrics {
      financialMetricsCallCount += 1;
      capturedFinancialMetricsArgs = args;
      return FAKE_FINANCIAL_METRICS;
    },
  } as AnalyzeContractHandlerDeps;

  const req = createMockReq({
    userSelectedContractType: "auto_finance",
    analysisLanguage: "ar",
  });
  const res = createMockRes();

  await handleAnalyzeContract(req, res, deps);

  assert.equal(res.statusCode, 200, "a valid request must succeed");
  assert.equal(parseCallCount, 1, "the PDF parser must be called exactly once");
  assert.equal(maskCallCount, 1, "the PII masker must be called exactly once");
  assert.equal(
    analyzeCallCount,
    1,
    "analyzeContract must be called exactly once — no independent detection or mismatch call",
  );

  const [maskedTextArg, contractTypeArg, analysisLanguageArg] = capturedArgs;
  assert.equal(
    maskedTextArg,
    FAKE_MASKED_TEXT,
    "analyzeContract must receive the exact masked text produced by the masker",
  );
  assert.equal(
    contractTypeArg,
    "auto_finance",
    "analyzeContract must receive the userSelectedContractType unchanged",
  );
  assert.equal(
    analysisLanguageArg,
    "ar",
    "analyzeContract must receive the selected analysis language unchanged",
  );

  // Milestone 5.7: the financial engine must be called exactly once, after a
  // successful analysis, with exactly the validated analysis object — no
  // masked text, no raw text, no second (reference-date) argument.
  assert.equal(financialMetricsCallCount, 1, "calculateFinancialMetrics must be called exactly once");
  assert.equal(capturedFinancialMetricsArgs.length, 1, "calculateFinancialMetrics must be called with no options/reference-date argument");
  assert.equal(
    capturedFinancialMetricsArgs[0],
    FAKE_ANALYSIS_RESULT,
    "calculateFinancialMetrics must receive exactly the validated analysis object returned by analyzeContract",
  );

  const body = res.body as {
    success: boolean;
    analysis: { contractType: string };
    financialMetrics: unknown;
    financialMetricsError: unknown;
    fileName: string;
    piiStatistics: unknown;
  };
  assert.equal(body.success, true);
  assert.equal(body.analysis.contractType, "auto_finance");
  assert.equal(body.financialMetrics, FAKE_FINANCIAL_METRICS, "the response must preserve the exact financialMetrics returned by the engine");
  assert.equal(body.financialMetricsError, null);
  // Existing response fields remain present and unchanged.
  assert.equal(body.fileName, "test.pdf");
  assert.deepEqual(body.piiStatistics, EMPTY_PII_STATISTICS);

  console.log("PASS analyzeContract.validType.test.ts");
}

run();
