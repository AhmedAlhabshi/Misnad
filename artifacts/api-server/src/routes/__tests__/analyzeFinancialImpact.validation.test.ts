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

async function testMissingBodyReturns400(): Promise<void> {
  const req = createMockReq({});
  const res = createMockRes();

  await handleAnalyzeFinancialImpact(req, res);

  assert.equal(res.statusCode, 400, "an empty body must return HTTP 400");
  assert.equal((res.body as { success: boolean }).success, false);

  console.log("PASS testMissingBodyReturns400");
}

async function testInvalidContractTypeReturns400(): Promise<void> {
  const req = createMockReq({ ...VALID_PAYLOAD, contractType: "not_a_real_type" });
  const res = createMockRes();

  await handleAnalyzeFinancialImpact(req, res);

  assert.equal(res.statusCode, 400, "an invalid contractType must return HTTP 400");

  console.log("PASS testInvalidContractTypeReturns400");
}

/**
 * The schema itself must have no room for PII-shaped fields — a payload
 * that tries to smuggle a name/national-id/phone/email/IBAN field through
 * must be silently stripped (zod's default object parsing drops unknown
 * keys) rather than rejected-or-forwarded, since the downstream AI prompt
 * builder only ever reads the schema's own known fields.
 */
async function testUnknownPiiShapedFieldsAreNotForwarded(): Promise<void> {
  const req = createMockReq({
    ...VALID_PAYLOAD,
    nationalId: "1234567890",
    phone: "+966500000000",
    partyName: "Ahmad Ali",
  });
  const res = createMockRes();
  let receivedRequest: unknown = null;

  const deps: AnalyzeFinancialImpactHandlerDeps = {
    analyzePersonalizedFinancialImpact: async (request) => {
      receivedRequest = request;
      const response: PersonalizedAnalysisResponse = { personalImpact: [], thingsToWatch: [], beforeYouSign: [] };
      return response;
    },
  };

  await handleAnalyzeFinancialImpact(req, res, deps);

  assert.equal(res.statusCode, 200, "a structurally valid payload with extra fields must still succeed");
  assert.ok(receivedRequest, "the service must have been called");
  assert.ok(!("nationalId" in (receivedRequest as object)), "nationalId must not be forwarded to the service");
  assert.ok(!("phone" in (receivedRequest as object)), "phone must not be forwarded to the service");
  assert.ok(!("partyName" in (receivedRequest as object)), "partyName must not be forwarded to the service");

  console.log("PASS testUnknownPiiShapedFieldsAreNotForwarded");
}

async function testValidPayloadReturnsAnalysis(): Promise<void> {
  const req = createMockReq(VALID_PAYLOAD);
  const res = createMockRes();

  const deps: AnalyzeFinancialImpactHandlerDeps = {
    analyzePersonalizedFinancialImpact: async () => ({
      personalImpact: [{ title: "T", explanation: "E", basis: "B" }],
      thingsToWatch: [],
      beforeYouSign: [],
    }),
  };

  await handleAnalyzeFinancialImpact(req, res, deps);

  assert.equal(res.statusCode, 200);
  assert.equal((res.body as { success: boolean }).success, true);
  assert.equal((res.body as { analysis: PersonalizedAnalysisResponse }).analysis.personalImpact.length, 1);

  console.log("PASS testValidPayloadReturnsAnalysis");
}

async function testServiceFailureReturns422(): Promise<void> {
  const req = createMockReq(VALID_PAYLOAD);
  const res = createMockRes();

  const deps: AnalyzeFinancialImpactHandlerDeps = {
    analyzePersonalizedFinancialImpact: async () => {
      throw new Error("boom");
    },
  };

  await handleAnalyzeFinancialImpact(req, res, deps);

  assert.equal(res.statusCode, 422, "a service failure must return HTTP 422, never a raw 500");
  assert.equal((res.body as { success: boolean }).success, false);

  console.log("PASS testServiceFailureReturns422");
}

export async function run(): Promise<void> {
  await testMissingBodyReturns400();
  await testInvalidContractTypeReturns400();
  await testUnknownPiiShapedFieldsAreNotForwarded();
  await testValidPayloadReturnsAnalysis();
  await testServiceFailureReturns422();

  console.log("PASS analyzeFinancialImpact.validation.test.ts");
}

run();
