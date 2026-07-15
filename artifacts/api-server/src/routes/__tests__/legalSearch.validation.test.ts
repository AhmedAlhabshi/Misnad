import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { FakeEmbeddingProvider, InMemoryLegalChunkRepository } from "@workspace/legal-rag";
import { handleLegalSearch, type LegalSearchHandlerDeps } from "../legalSearch";

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
  query: "What is the maximum administrative fee?",
  contractType: "auto_finance",
  language: "EN",
  topics: ["fees"],
  topK: 5,
};

function fakeDeps(): LegalSearchHandlerDeps {
  return {
    repository: new InMemoryLegalChunkRepository(),
    embeddingProvider: new FakeEmbeddingProvider(64),
  };
}

async function testMissingBodyReturns400(): Promise<void> {
  const req = createMockReq({});
  const res = createMockRes();

  await handleLegalSearch(req, res, fakeDeps());

  assert.equal(res.statusCode, 400, "an empty body must return HTTP 400");
  assert.equal((res.body as { success: boolean }).success, false);

  console.log("PASS testMissingBodyReturns400");
}

async function testInvalidContractTypeReturns400(): Promise<void> {
  const req = createMockReq({ ...VALID_PAYLOAD, contractType: "not_a_real_type" });
  const res = createMockRes();

  await handleLegalSearch(req, res, fakeDeps());

  assert.equal(res.statusCode, 400, "an invalid contractType must return HTTP 400");

  console.log("PASS testInvalidContractTypeReturns400");
}

async function testOverLongQueryReturns400(): Promise<void> {
  const req = createMockReq({ ...VALID_PAYLOAD, query: "a".repeat(1000) });
  const res = createMockRes();

  await handleLegalSearch(req, res, fakeDeps());

  assert.equal(res.statusCode, 400, "a query over the maximum length must return HTTP 400");

  console.log("PASS testOverLongQueryReturns400");
}

/**
 * The schema itself has no room for PII-shaped fields (no file, no party
 * name/national ID/phone) — this endpoint only ever accepts a query string,
 * contract type, topics, and topK, so there is nothing else to strip.
 */
async function testValidPayloadWithEmptyIndexReturnsInsufficientSource(): Promise<void> {
  const req = createMockReq(VALID_PAYLOAD);
  const res = createMockRes();

  await handleLegalSearch(req, res, fakeDeps());

  assert.equal(res.statusCode, 200, "a structurally valid payload must succeed even when the index has no data");
  const body = res.body as { success: boolean; status: string; results: unknown[] };
  assert.equal(body.success, true);
  assert.equal(body.status, "insufficient_source", "an empty repository must return insufficient_source, never a fabricated match");
  assert.deepEqual(body.results, []);

  console.log("PASS testValidPayloadWithEmptyIndexReturnsInsufficientSource");
}

async function testRepositoryFailureReturns422(): Promise<void> {
  const req = createMockReq(VALID_PAYLOAD);
  const res = createMockRes();

  const deps: LegalSearchHandlerDeps = {
    repository: {
      getExistingChunkFingerprints: async () => new Map(),
      upsertSource: async () => {},
      replaceSourceChunks: async () => {},
      disableSource: async () => {},
      vectorSearch: async () => {
        throw new Error("boom");
      },
      keywordSearch: async () => [],
    },
    embeddingProvider: new FakeEmbeddingProvider(64),
  };

  await handleLegalSearch(req, res, deps);

  assert.equal(res.statusCode, 422, "a retrieval failure must return HTTP 422, never a raw 500");
  assert.equal((res.body as { success: boolean }).success, false);

  console.log("PASS testRepositoryFailureReturns422");
}

export async function run(): Promise<void> {
  await testMissingBodyReturns400();
  await testInvalidContractTypeReturns400();
  await testOverLongQueryReturns400();
  await testValidPayloadWithEmptyIndexReturnsInsufficientSource();
  await testRepositoryFailureReturns422();

  console.log("PASS legalSearch.validation.test.ts");
}

run();
