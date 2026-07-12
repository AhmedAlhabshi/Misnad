import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { handleAnalyzeContract, type AnalyzeContractHandlerDeps } from "../analyzeContract";
import type { ParsedDocument } from "../../services/documentParser";
import type { MaskedDocument, PiiStatistics } from "../../services/piiMasker";
import { ContractAnalysisError } from "@workspace/contract-analysis";
import type { ContractUnderstanding } from "@workspace/contract-schema";
import { financialMetricsSchema, type FinancialMetrics } from "@workspace/financial-metrics";

function createMockReq(body: Record<string, unknown>): Request {
  return {
    file: { buffer: Buffer.from("not a real pdf"), originalname: "test.pdf" },
    body,
    log: { warn() {}, error() {} },
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

const FAKE_MASKED_TEXT = "Masked auto finance contract body, unique-marker-8b3e21.";

const EMPTY_PII_STATISTICS: PiiStatistics = {
  names: 0,
  nationalIds: 0,
  iqamaNumbers: 0,
  phones: 0,
  emails: 0,
  ibans: 0,
  bankAccounts: 0,
};

const FAKE_ANALYSIS_RESULT: ContractUnderstanding = {
  contractType: "auto_finance",
  parties: [],
  financialObligations: [
    { description: "Monthly installment", amount: 1500, currency: "SAR", frequency: "monthly", dueDate: null },
  ],
  dates: [],
  penalties: [],
  fees: [{ description: "Documentation fee", amount: 100, currency: "SAR", isRecurring: false }],
  importantClauses: [],
  extractedNumbers: [],
  missingInformation: [],
  extractionNotes: null,
  typeDetails: {
    contractType: "auto_finance",
    vehicleMake: null,
    vehicleModel: null,
    vehicleYear: null,
    financedAmount: 80000,
    downPayment: null,
    interestRate: null,
    loanTermMonths: 36,
    monthlyInstallment: 1500,
    balloonPayment: null,
  },
};

function baseDeps(overrides: Partial<AnalyzeContractHandlerDeps> = {}): AnalyzeContractHandlerDeps {
  return {
    async parseContractPdf(): Promise<ParsedDocument> {
      return { text: "raw pdf text", textLength: 12, textPreview: "raw pdf text" };
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
    ...overrides,
  } as AnalyzeContractHandlerDeps;
}

/** Test 2 — Milestone 4 failure: the financial engine must never be called, and every financial field must be null. */
async function testMilestone4FailureSkipsFinancialMetrics(): Promise<void> {
  let financialMetricsCallCount = 0;

  const deps = baseDeps({
    async analyzeContract(): Promise<ContractUnderstanding> {
      throw new ContractAnalysisError("SCHEMA_VALIDATION_FAILED", "The AI response did not match the expected structure.");
    },
    calculateFinancialMetrics(): FinancialMetrics {
      financialMetricsCallCount += 1;
      return { schemaVersion: "1.0" } as unknown as FinancialMetrics;
    },
  });

  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();

  await handleAnalyzeContract(req, res, deps);

  assert.equal(financialMetricsCallCount, 0, "calculateFinancialMetrics must never be called when Milestone 4 analysis fails");

  const body = res.body as {
    success: boolean;
    analysis: unknown;
    financialMetrics: unknown;
    financialMetricsError: unknown;
    analysisError: string;
  };
  assert.equal(body.analysis, null);
  assert.equal(body.financialMetrics, null);
  assert.equal(body.financialMetricsError, null);
  assert.ok(body.analysisError, "the existing analysisError behavior must remain intact");

  console.log("PASS testMilestone4FailureSkipsFinancialMetrics");
}

/** Test 3 — Financial Metrics partial failure: a valid analysis must survive a thrown engine error, as a safe public error. */
async function testFinancialMetricsPartialFailure(): Promise<void> {
  const deps = baseDeps({
    calculateFinancialMetrics(): FinancialMetrics {
      throw new Error("internal invariant violated: candidate pool exceeded bounds at pipeline/conflicts.ts:42, stack trace follows...");
    },
  });

  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();

  await handleAnalyzeContract(req, res, deps);

  assert.equal(res.statusCode, 200, "a financial-metrics failure must not become an HTTP 500 (or otherwise fail the request)");

  const body = res.body as {
    success: boolean;
    analysis: { contractType: string };
    financialMetrics: unknown;
    financialMetricsError: { code: string; message: string } | null;
  };
  assert.equal(body.success, true, "the response must remain a successful (partial-success) response");
  assert.ok(body.analysis, "the valid Milestone 4 analysis must be preserved");
  assert.equal(body.analysis.contractType, "auto_finance");
  assert.equal(body.financialMetrics, null);
  assert.ok(body.financialMetricsError);
  assert.equal(body.financialMetricsError?.code, "FINANCIAL_METRICS_FAILED");
  assert.equal(body.financialMetricsError?.message, "Financial metrics could not be calculated.");

  const serializedError = JSON.stringify(body.financialMetricsError);
  assert.equal(serializedError.includes("stack"), false, "the response must never expose a stack trace");
  assert.equal(serializedError.includes("pipeline/conflicts.ts"), false, "the response must never expose internal source paths");
  assert.equal(serializedError.includes("candidate"), false, "the response must never expose internal candidate details");
  assert.equal(serializedError.includes("invariant"), false, "the response must use only the generic public message, not the internal error text");

  console.log("PASS testFinancialMetricsPartialFailure");
}

/** Test 6 — existing response fields (fileName, piiStatistics, message, textLength, textPreview) remain present and unchanged. */
async function testExistingResponseFieldsPreserved(): Promise<void> {
  const deps = baseDeps();
  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();

  await handleAnalyzeContract(req, res, deps);

  const body = res.body as {
    success: boolean;
    fileName: string;
    message: string;
    textLength: number;
    textPreview: string;
    maskedTextPreview: string;
    piiStatistics: PiiStatistics;
  };
  assert.equal(body.success, true);
  assert.equal(body.fileName, "test.pdf");
  assert.equal(body.message, "PDF processed and PII masked successfully");
  assert.equal(body.textLength, 12);
  assert.equal(body.textPreview, "raw pdf text");
  assert.equal(body.maskedTextPreview, FAKE_MASKED_TEXT.slice(0, 1000));
  assert.deepEqual(body.piiStatistics, EMPTY_PII_STATISTICS);

  console.log("PASS testExistingResponseFieldsPreserved");
}

/** Test 7 — real engine integration: financialMetrics validates against the actual Milestone 5.5 schema. */
async function testRealEngineOutputValidatesAgainstSchema(): Promise<void> {
  // Deliberately does NOT mock calculateFinancialMetrics — this exercises the
  // real @workspace/financial-metrics package end-to-end through the route.
  const { calculateFinancialMetrics } = await import("@workspace/financial-metrics");
  const deps = baseDeps({ calculateFinancialMetrics });

  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();

  await handleAnalyzeContract(req, res, deps);

  const body = res.body as { success: boolean; financialMetrics: unknown; financialMetricsError: unknown };
  assert.equal(body.success, true);
  assert.equal(body.financialMetricsError, null);

  const validation = financialMetricsSchema.safeParse(body.financialMetrics);
  assert.equal(validation.success, true, "the real engine's output, as returned in the response, must validate against the Milestone 5.5 schema");

  if (validation.success) {
    assert.equal(validation.data.totalCost.calculatedBaseCost.value, 80000, "the real engine must have actually calculated from the analysis, not returned a stub");
    // No Risk Score field anywhere in the real output.
    assert.equal(JSON.stringify(validation.data).toLowerCase().includes("risk"), false);
  }

  console.log("PASS testRealEngineOutputValidatesAgainstSchema");
}

export async function run(): Promise<void> {
  await testMilestone4FailureSkipsFinancialMetrics();
  await testFinancialMetricsPartialFailure();
  await testExistingResponseFieldsPreserved();
  await testRealEngineOutputValidatesAgainstSchema();

  console.log("PASS analyzeContract.financialMetrics.test.ts");
}

run();
