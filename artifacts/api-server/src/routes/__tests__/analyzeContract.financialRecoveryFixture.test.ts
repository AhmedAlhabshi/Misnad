import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { recoverFinancialValues, type DocumentExtractionResult } from "@workspace/document-ocr";
import { maskPii } from "../../services/piiMasker";
import { handleAnalyzeContract, type AnalyzeContractHandlerDeps } from "../analyzeContract";
import type { ContractUnderstanding } from "@workspace/contract-schema";
import type { FinancialMetrics } from "@workspace/financial-metrics";

/**
 * A sanitized reconstruction of the real failed auto-finance contract's OCR
 * output from the original bug report — same corruption patterns (digits
 * read as "0", split fragments like "9620 0", a percentage misread as a raw
 * digit), no real customer data. Each field is on its own line, matching a
 * real structured contract layout.
 */
const REAL_WORLD_CORRUPTED_OCR_TEXT = `
عقد تمويل سيارة
السعر النقدي 0 ريال سعودي (مائة وعشرون ألف ريال فقط)
الدفعة الأولى 9620 0 ريال (أربعة وعشرون ألف ريال)
أصل التمويل 0 ريال (ستة وتسعون ألف ريال)
نسبة الربح 6 سنوياً (خمسة بالمائة)
إجمالي الربح 0 ريال (تسعة عشر ألفاً ومائتان)
إجمالي المبلغ الواجب سداده 0 ريال (مائة وخمسة عشر ألفاً ومائتان)
مدة التمويل 8 شهراً (4 سنوات)
القسط الشهري 0 ريال
جدول الأقساط: 2400 2400 2400 2400 2400
السجل التجاري: 1010456789
رقم الهوية الوطنية للعميل: 1098765432
`;

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

export async function run(): Promise<void> {
  // 1. The real recovery engine, run directly on the sanitized corrupted fixture, must recover all 8 expected values.
  const recovery = recoverFinancialValues(REAL_WORLD_CORRUPTED_OCR_TEXT);
  const byField = new Map(recovery.values.map((value) => [value.field, value]));

  assert.equal(byField.get("cashPrice")?.value, 120000);
  assert.equal(byField.get("downPayment")?.value, 24000);
  assert.equal(byField.get("financedAmount")?.value, 96000);
  assert.equal(byField.get("profitRate")?.value, 5);
  assert.equal(byField.get("totalProfit")?.value, 19200);
  assert.equal(byField.get("totalPayable")?.value, 115200);
  assert.equal(byField.get("loanTermMonths")?.value, 48);
  assert.equal(byField.get("monthlyInstallment")?.value, 2400);
  console.log("PASS the real recovery engine recovers all 8 expected values from the sanitized real-world fixture");

  // 2. Through the full route: extraction (carrying these real recovered values) -> PII masking -> analyzeContract,
  // with recoveryNotes forwarded, and the commercial registration/national ID both correctly distinguished.
  const extraction: DocumentExtractionResult = {
    method: "ocr",
    text: REAL_WORLD_CORRUPTED_OCR_TEXT,
    pageCount: 1,
    quality: "good",
    warnings: [],
    recoveredFinancialValues: recovery.values,
    metadata: {
      ocrUsed: true,
      processedPages: 1,
      skippedPages: 0,
      durationMs: 1000,
      financialQuality: "good",
      financialQualityScore: 90,
      recoveredFinancialValues: recovery.values.filter((v) => v.status === "direct" || v.status === "recovered").length,
    },
  };

  let capturedAnalyzeArgs: unknown[] = [];
  const deps: AnalyzeContractHandlerDeps = {
    async extractDocumentText() {
      return extraction;
    },
    maskPii,
    async analyzeContract(...args: unknown[]): Promise<ContractUnderstanding> {
      capturedAnalyzeArgs = args;
      return FAKE_ANALYSIS_RESULT;
    },
    calculateFinancialMetrics(): FinancialMetrics {
      return { schemaVersion: "1.0" } as unknown as FinancialMetrics;
    },
  };

  const req = createMockReq({ userSelectedContractType: "auto_finance", analysisLanguage: "ar" });
  const res = createMockRes();
  await handleAnalyzeContract(req, res, deps);

  const [maskedTextArg, , , analyzeOptions] = capturedAnalyzeArgs as [string, string, string, { recoveryNotes?: typeof recovery.values }];

  // The commercial registration must not read as [NATIONAL_ID], and the real national ID must still be masked.
  assert.equal(maskedTextArg.includes("1010456789"), false);
  assert.equal(maskedTextArg.includes("1098765432"), false);
  assert.ok(maskedTextArg.includes("[COMMERCIAL_REGISTRATION]"), "the CR number must not be misclassified as a national ID");
  assert.ok(maskedTextArg.includes("[NATIONAL_ID]"), "the real national ID must still be masked");

  // The exact recovered values (with their provenance) must be the ones forwarded to contract-analysis.
  assert.ok(analyzeOptions.recoveryNotes, "recoveryNotes must be forwarded to analyzeContract");
  const forwardedCashPrice = analyzeOptions.recoveryNotes!.find((v) => v.field === "cashPrice");
  assert.equal(forwardedCashPrice?.value, 120000);
  assert.equal(forwardedCashPrice?.source, "amount_words");

  const body = res.body as { documentExtraction: Record<string, unknown> };
  assert.equal(body.documentExtraction.financialQuality, "good");
  assert.equal(body.documentExtraction.recoveredFinancialValues, 8, "all 8 tracked fields must resolve to direct/recovered status");

  console.log("PASS the full route wires real recovered financial values, masked text, and CR/national-ID distinction together correctly");

  console.log("PASS analyzeContract.financialRecoveryFixture.test.ts");
}

run();
