import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { generateContractRagSessionId, indexContractSession, InMemoryContractRagRepository } from "@workspace/contract-rag";
import { FakeEmbeddingProvider, GEMINI_EMBEDDING_DIMENSIONS } from "@workspace/legal-rag";
import { handleContractSearch, type ContractSearchHandlerDeps } from "../contractSearch";

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

function fakeDeps(): ContractSearchHandlerDeps {
  return {
    repository: new InMemoryContractRagRepository(),
    embeddingProvider: new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS),
  };
}

const VALID_BODY_TEMPLATE = {
  query: "how much do I pay monthly",
  language: "en",
  topK: 3,
};

async function testMissingBodyReturns400(): Promise<void> {
  const req = createMockReq({});
  const res = createMockRes();

  await handleContractSearch(req, res, fakeDeps());

  assert.equal(res.statusCode, 400, "an empty body must return HTTP 400");
  assert.equal((res.body as { success: boolean }).success, false);

  console.log("PASS testMissingBodyReturns400");
}

async function testInvalidSessionIdFormatReturns400(): Promise<void> {
  const req = createMockReq({ ...VALID_BODY_TEMPLATE, sessionId: "'; DROP TABLE contract_rag_sessions; --" });
  const res = createMockRes();

  await handleContractSearch(req, res, fakeDeps());

  assert.equal(res.statusCode, 400, "a malformed session id must return HTTP 400, never reaching a database query");

  console.log("PASS testInvalidSessionIdFormatReturns400");
}

async function testOverLongQueryReturns400(): Promise<void> {
  const req = createMockReq({ ...VALID_BODY_TEMPLATE, sessionId: generateContractRagSessionId(), query: "a".repeat(5000) });
  const res = createMockRes();

  await handleContractSearch(req, res, fakeDeps());

  assert.equal(res.statusCode, 400, "a query over the schema's maximum length must return HTTP 400");

  console.log("PASS testOverLongQueryReturns400");
}

/**
 * A well-formed but nonexistent (or expired, or belonging to someone else)
 * session id must never be distinguishable from any other unavailable
 * case — always the same generic `contract_session_unavailable` status.
 */
async function testNonexistentSessionReturnsContractSessionUnavailable(): Promise<void> {
  const req = createMockReq({ ...VALID_BODY_TEMPLATE, sessionId: generateContractRagSessionId() });
  const res = createMockRes();

  await handleContractSearch(req, res, fakeDeps());

  assert.equal(res.statusCode, 200, "a well-formed but nonexistent session must still be a successful HTTP response");
  const body = res.body as { success: boolean; status: string; results: unknown[] };
  assert.equal(body.success, true);
  assert.equal(body.status, "contract_session_unavailable");
  assert.deepEqual(body.results, []);

  console.log("PASS testNonexistentSessionReturnsContractSessionUnavailable");
}

/** An indexed session's own chunks are found by a relevant query. */
async function testIndexedSessionReturnsResults(): Promise<void> {
  const deps = fakeDeps();
  const indexed = await indexContractSession(
    {
      maskedDocument: { maskedText: "Section 1: Monthly Payment\nThe borrower shall pay a monthly installment of 2,400 SAR." },
      contractType: "auto_finance",
      analysisLanguage: "en",
    },
    deps,
  );

  const req = createMockReq({ ...VALID_BODY_TEMPLATE, sessionId: indexed.sessionId });
  const res = createMockRes();

  await handleContractSearch(req, res, deps);

  assert.equal(res.statusCode, 200);
  const body = res.body as { success: boolean; status: string; results: { chunkId: string; section: string | null; excerpt: string; score: number }[] };
  assert.equal(body.success, true);
  assert.equal(body.status, "results_found");
  assert.ok(body.results.length > 0);
  assert.ok(body.results[0].excerpt.length > 0);

  // Never exposes embeddings or raw database internals.
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes("embedding"), false, "the response must never expose embedding vectors");

  console.log("PASS testIndexedSessionReturnsResults");
}

async function testRepositoryFailureReturns422(): Promise<void> {
  const req = createMockReq({ ...VALID_BODY_TEMPLATE, sessionId: generateContractRagSessionId() });
  const res = createMockRes();

  const deps: ContractSearchHandlerDeps = {
    repository: {
      createSession: async () => {},
      getActiveSession: async () => ({
        sessionId: "does-not-matter",
        contractType: "other",
        analysisLanguage: "en",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        status: "active",
        chunkCount: 1,
        sourceFingerprint: null,
      }),
      replaceSessionChunks: async () => {},
      deleteSession: async () => {},
      vectorSearch: async () => {
        throw new Error("boom");
      },
      getSessionChunks: async () => [],
      deleteExpired: async () => ({ deletedSessionCount: 0, deletedChunkCount: 0 }),
    },
    embeddingProvider: new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS),
  };

  await handleContractSearch(req, res, deps);

  assert.equal(res.statusCode, 422, "a retrieval failure must return HTTP 422, never a raw 500");
  assert.equal((res.body as { success: boolean }).success, false);

  console.log("PASS testRepositoryFailureReturns422");
}

export async function run(): Promise<void> {
  await testMissingBodyReturns400();
  await testInvalidSessionIdFormatReturns400();
  await testOverLongQueryReturns400();
  await testNonexistentSessionReturnsContractSessionUnavailable();
  await testIndexedSessionReturnsResults();
  await testRepositoryFailureReturns422();

  console.log("PASS contractSearch.validation.test.ts");
}

run();
