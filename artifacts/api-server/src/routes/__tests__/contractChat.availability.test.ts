import assert from "node:assert/strict";
import { FakeEmbeddingProvider, GEMINI_EMBEDDING_DIMENSIONS } from "@workspace/legal-rag";
import { handleContractChat } from "../contractChat";
import { anyValidSessionId, createMockReq, createMockRes, fullyMockedDeps, setupContractRagFixture, setupLegalRagFixture } from "./contractChatTestFixtures";

const AUTO_FINANCE_MASKED_TEXT =
  "Early Termination\nEither party may terminate this financing agreement early by giving thirty (30) days written notice, subject to an early settlement fee.";

export async function run(): Promise<void> {
  const contractRag = await setupContractRagFixture(AUTO_FINANCE_MASKED_TEXT);
  const legalRag = await setupLegalRagFixture();
  const ragDeps = {
    contractRag: { repository: contractRag.repository, embeddingProvider: contractRag.embeddingProvider },
    legalRag: { repository: legalRag.repository, embeddingProvider: legalRag.embeddingProvider },
  };

  // --- Missing/expired Contract RAG session: never answered as though the contract were available ---
  {
    const { req } = createMockReq({
      question: "What does my contract say about early termination?",
      contractRagSessionId: anyValidSessionId(), // well-formed, but never indexed — behaves identically to expired/foreign
      selectedContractType: "auto_finance",
      answerLanguage: "EN",
    });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps(ragDeps));
    assert.equal(res.statusCode, 200, "a missing/expired session must still produce a graceful, successful response");
    const body = res.body as { success: true; route: string; answer: { citations: unknown[]; evidenceStatus: string; warnings: string[] } };
    assert.equal(body.route, "contract", "the route must be preserved, never silently downgraded to general");
    assert.deepEqual(body.answer.citations, [], "no contract citation can exist when the session is unavailable");
    assert.equal(body.answer.evidenceStatus, "insufficient");
    assert.ok(body.answer.warnings.some((w) => w.includes("contract_evidence_empty") || w.includes("session")));
  }
  console.log("PASS a missing/expired Contract RAG session preserves the route and never answers as though the contract were available");

  // --- Unavailable Contract RAG (a genuine infrastructure failure, not just a missing session) maps to CONTRACT_CONTEXT_UNAVAILABLE ---
  {
    const brokenRepository = {
      createSession: async () => {},
      getActiveSession: async () => {
        throw new Error("connection refused");
      },
      replaceSessionChunks: async () => {},
      deleteSession: async () => {},
      vectorSearch: async () => [],
      getSessionChunks: async () => [],
      deleteExpired: async () => ({ deletedSessionCount: 0, deletedChunkCount: 0 }),
    };
    const { req } = createMockReq({
      question: "What does my contract say about early termination?",
      contractRagSessionId: contractRag.sessionId,
      selectedContractType: "auto_finance",
      answerLanguage: "EN",
    });
    const res = createMockRes();
    await handleContractChat(
      req,
      res,
      fullyMockedDeps({ contractRag: { repository: brokenRepository, embeddingProvider: contractRag.embeddingProvider }, legalRag: ragDeps.legalRag }),
    );
    assert.equal(res.statusCode, 422);
    const body = res.body as { success: false; error: { code: string } };
    assert.equal(body.error.code, "CONTRACT_CONTEXT_UNAVAILABLE");
  }
  console.log("PASS an unexpected Contract RAG infrastructure failure maps to CONTRACT_CONTEXT_UNAVAILABLE");

  // --- Unavailable Legal RAG (infrastructure failure) maps to LEGAL_RETRIEVAL_UNAVAILABLE ---
  {
    const brokenLegalRepository = {
      vectorSearch: async () => {
        throw new Error("connection refused");
      },
      keywordSearch: async () => [],
      upsertSource: async () => {},
      replaceSourceChunks: async () => {},
      disableSource: async () => {},
      getExistingChunkFingerprints: async () => new Map(),
    };
    const { req } = createMockReq({
      question: "What is the maximum administrative charge a creditor can impose under the regulations?",
      selectedContractType: "auto_finance",
      answerLanguage: "EN",
    });
    const res = createMockRes();
    await handleContractChat(
      req,
      res,
      fullyMockedDeps({ legalRag: { repository: brokenLegalRepository, embeddingProvider: new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS) } }),
    );
    assert.equal(res.statusCode, 422);
    const body = res.body as { success: false; error: { code: string } };
    assert.equal(body.error.code, "LEGAL_RETRIEVAL_UNAVAILABLE");
  }
  console.log("PASS an unexpected Legal RAG infrastructure failure maps to LEGAL_RETRIEVAL_UNAVAILABLE");

  // --- Legal comparison with Legal RAG unavailable (not configured): route preserved, unavailable source reported ---
  {
    const { req } = createMockReq({
      question: "Is this early termination penalty allowed under Saudi regulations?",
      contractRagSessionId: contractRag.sessionId,
      selectedContractType: "auto_finance",
      answerLanguage: "EN",
    });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps({ ...ragDeps, isLegalRagConfigured: () => false }));
    assert.equal(res.statusCode, 200);
    const body = res.body as { success: true; route: string; unavailableSources: string[]; answer: { citations: Array<{ source: string }> } };
    assert.equal(body.route, "contract_and_legal", "the route must never be silently downgraded when only legal is unavailable");
    assert.ok(body.unavailableSources.includes("legal"));
    assert.ok(!body.answer.citations.some((c) => c.source === "legal"));
    assert.ok(body.answer.citations.some((c) => c.source === "contract"), "the still-available contract source must still be used");
  }
  console.log("PASS a legal comparison with Legal RAG unavailable preserves the route and clearly reports the unavailable source");

  // --- Missing financial metrics: financial question still answered gracefully ---
  {
    const { req } = createMockReq({
      question: "How much will I pay every month?",
      selectedContractType: "auto_finance",
      answerLanguage: "EN",
    });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps(ragDeps));
    assert.equal(res.statusCode, 200);
    const body = res.body as { success: true; route: string; answer: { evidenceStatus: string; usedFinancialFactKeys: string[] } };
    assert.equal(body.route, "financial");
    assert.equal(body.answer.evidenceStatus, "insufficient");
    assert.deepEqual(body.answer.usedFinancialFactKeys, []);
  }
  console.log("PASS a financial question without financial metrics is answered gracefully as insufficient evidence, never an error");

  console.log("PASS contractChat.availability.test.ts");
}

run();
