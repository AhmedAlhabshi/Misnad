import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { handleAnalyzeContract, type AnalyzeContractHandlerDeps } from "../analyzeContract";
import type { ParsedDocument } from "../../services/documentParser";
import type { MaskedDocument, PiiStatistics } from "../../services/piiMasker";
import type { ContractUnderstanding } from "@workspace/contract-schema";

function createMockReq(body: Record<string, unknown>): Request {
  return {
    file: { buffer: Buffer.from("not a real pdf"), originalname: "test.pdf" },
    body,
    log: { warn() {} },
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

const FAKE_MASKED_TEXT = "Masked auto finance contract body, unique-marker-7a2f19.";

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

export async function run(): Promise<void> {
  let parseCallCount = 0;
  let maskCallCount = 0;
  let analyzeCallCount = 0;
  let capturedArgs: unknown[] = [];

  const deps: AnalyzeContractHandlerDeps = {
    async parseContractPdf(): Promise<ParsedDocument> {
      parseCallCount += 1;
      return { text: "raw pdf text", textLength: 12, textPreview: "raw pdf text" };
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

  const body = res.body as { success: boolean; analysis: { contractType: string } };
  assert.equal(body.success, true);
  assert.equal(body.analysis.contractType, "auto_finance");

  console.log("PASS analyzeContract.validType.test.ts");
}

run();
