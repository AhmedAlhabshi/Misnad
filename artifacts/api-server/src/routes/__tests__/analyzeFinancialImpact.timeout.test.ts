import assert from "node:assert/strict";
import type { Request, Response } from "express";
import type { PersonalizedAnalysisResponse } from "@workspace/contract-analysis";
import { handleAnalyzeFinancialImpact, type AnalyzeFinancialImpactHandlerDeps } from "../analyzeFinancialImpact";

function createMockReq(body: unknown): Request {
  return { body, log: { warn() {} } } as unknown as Request;
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

const VALID_PAYLOAD = {
  analysisLanguage: "en",
  contractType: "auto_finance",
  contractSummary: "A vehicle financing agreement between the buyer and the finance company.",
  clauses: [
    { title: "Late payment", summary: "A fee applies for late payment.", plainExplanation: "Pay on time to avoid extra charges.", riskLevel: "medium" },
  ],
  financialConcepts: [
    {
      conceptId: "monthly_installment",
      label: "Monthly installment",
      amount: 2400,
      currency: "SAR",
      frequency: "monthly",
      role: "recurring_outflow",
      bucket: "guaranteed",
      mandatory: true,
      conditional: false,
      refundable: null,
      trigger: null,
    },
  ],
  budgetMetrics: {
    monthlyIncome: 12000,
    essentialExpenses: 5000,
    existingMonthlyDebt: 2000,
    savings: 20000,
    currency: "SAR",
    applicableMonthlyOutflow: 2400,
    applicableUpfrontLiquidity: 10800,
    availableBeforeContract: 5000,
    availableAfterContract: 2600,
    contractIncomeRatio: 20,
    totalCommitmentRatio: 36.7,
    remainingSavings: 9200,
    emergencyCoverageMonths: 1,
  },
};

/**
 * Proves the route-level total-timeout safety net (see
 * `DEFAULT_PERSONALIZED_ANALYSIS_TIMEOUT_MS`/`withTimeout` in
 * `analyzeFinancialImpact.ts`): a service call that never resolves must
 * still produce a bounded, prompt 504 response — the frontend's retry UI
 * (see `PersonalizedAnalysisSection`) depends on this response actually
 * arriving rather than hanging forever.
 */
async function testHangingServiceCallTimesOutPromptly(): Promise<void> {
  const req = createMockReq(VALID_PAYLOAD);
  const res = createMockRes();

  const deps: AnalyzeFinancialImpactHandlerDeps = {
    analyzePersonalizedFinancialImpact: () => new Promise(() => {}),
    timeoutMs: 20,
  };

  const startedAt = Date.now();
  await handleAnalyzeFinancialImpact(req, res, deps);
  const elapsedMs = Date.now() - startedAt;

  assert.equal(res.statusCode, 504, "a hanging service call must produce a 504, never hang the response");
  assert.equal((res.body as { success: boolean }).success, false);
  assert.equal((res.body as { code?: string }).code, "TIMEOUT");
  assert.ok(elapsedMs < 500, `the route must respond near the injected timeout, not wait for the hang (took ${elapsedMs}ms)`);

  console.log("PASS testHangingServiceCallTimesOutPromptly");
}

/** A fast, successful service call must not be affected by the timeout wrapper at all. */
async function testFastSuccessIsUnaffectedByTimeout(): Promise<void> {
  const req = createMockReq(VALID_PAYLOAD);
  const res = createMockRes();

  const deps: AnalyzeFinancialImpactHandlerDeps = {
    analyzePersonalizedFinancialImpact: async () => {
      const response: PersonalizedAnalysisResponse = { personalImpact: [], thingsToWatch: [], beforeYouSign: [] };
      return response;
    },
    timeoutMs: 20,
  };

  await handleAnalyzeFinancialImpact(req, res, deps);

  assert.equal(res.statusCode, 200, "a fast successful call must still return 200, never a timeout");
  assert.equal((res.body as { success: boolean }).success, true);

  console.log("PASS testFastSuccessIsUnaffectedByTimeout");
}

export async function run(): Promise<void> {
  await testHangingServiceCallTimesOutPromptly();
  await testFastSuccessIsUnaffectedByTimeout();

  console.log("PASS analyzeFinancialImpact.timeout.test.ts");
}

run();
