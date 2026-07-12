import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { handleAnalyzeContract } from "../analyzeContract";

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

async function testMissingContractTypeReturns400(): Promise<void> {
  const req = createMockReq({ analysisLanguage: "ar" });
  const res = createMockRes();

  await handleAnalyzeContract(req, res);

  assert.equal(res.statusCode, 400, "a missing userSelectedContractType must return HTTP 400");
  assert.equal((res.body as { success: boolean }).success, false);
  assert.ok(
    (res.body as { message: string }).message.includes("userSelectedContractType"),
    "the error message must clearly name the missing field",
  );

  console.log("PASS testMissingContractTypeReturns400");
}

async function testInvalidContractTypeReturns400(): Promise<void> {
  const req = createMockReq({
    userSelectedContractType: "not_a_real_contract_type",
    analysisLanguage: "ar",
  });
  const res = createMockRes();

  await handleAnalyzeContract(req, res);

  assert.equal(res.statusCode, 400, "an invalid userSelectedContractType must return HTTP 400");
  assert.equal((res.body as { success: boolean }).success, false);
  assert.ok(
    (res.body as { message: string }).message.includes("userSelectedContractType"),
    "the error message must clearly name the invalid field",
  );

  console.log("PASS testInvalidContractTypeReturns400");
}

async function testMissingFileStillReturns400(): Promise<void> {
  const req = {
    file: undefined,
    body: { userSelectedContractType: "credit_card", analysisLanguage: "ar" },
    log: { warn() {} },
  } as unknown as Request;
  const res = createMockRes();

  await handleAnalyzeContract(req, res);

  assert.equal(res.statusCode, 400, "a missing file must still return HTTP 400 (pre-existing, unchanged behavior)");

  console.log("PASS testMissingFileStillReturns400");
}

export async function run(): Promise<void> {
  await testMissingContractTypeReturns400();
  await testInvalidContractTypeReturns400();
  await testMissingFileStillReturns400();

  console.log("PASS analyzeContract.validation.test.ts");
}

run();
