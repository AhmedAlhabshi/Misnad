import assert from "node:assert/strict";
import { FakeEmbeddingProvider, GEMINI_EMBEDDING_DIMENSIONS } from "@workspace/legal-rag";
import { indexContractSession } from "../indexing/orchestrate";
import { InMemoryContractRagRepository } from "../retrieval/inMemoryRepository";
import { retrieveContractContext } from "../retrieval/service";

export async function run(): Promise<void> {
  const embeddingProvider = new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS);

  // 1. A freshly indexed session (default TTL) is immediately retrievable.
  {
    const repository = new InMemoryContractRagRepository();
    const indexed = await indexContractSession(
      { maskedDocument: { maskedText: "Section 1: Terms\nThe monthly fee is 100 SAR." }, contractType: "other", analysisLanguage: "en" },
      { repository, embeddingProvider },
    );
    const response = await retrieveContractContext({ sessionId: indexed.sessionId, query: "monthly fee", language: "en" }, { repository, embeddingProvider });
    assert.equal(response.status, "results_found");
  }
  console.log("PASS a freshly indexed session is immediately retrievable");

  // 2. TTL is configurable: overriding CONTRACT_RAG_TTL_MINUTES changes the actual expiry the session is created with.
  {
    const saved = process.env.CONTRACT_RAG_TTL_MINUTES;
    try {
      process.env.CONTRACT_RAG_TTL_MINUTES = "1";
      const repository = new InMemoryContractRagRepository();
      const indexed = await indexContractSession(
        { maskedDocument: { maskedText: "Section 1: Terms\nThe monthly fee is 100 SAR." }, contractType: "other", analysisLanguage: "en" },
        { repository, embeddingProvider },
      );
      const session = await repository.getActiveSession(indexed.sessionId);
      assert.ok(session, "the session must still be active immediately after creation with a short TTL");
      const ttlMs = session!.expiresAt.getTime() - session!.createdAt.getTime();
      assert.ok(ttlMs > 0 && ttlMs <= 90_000, "the session's actual expiry window must reflect the configured 1-minute TTL, not the hardcoded default");
    } finally {
      if (saved === undefined) delete process.env.CONTRACT_RAG_TTL_MINUTES;
      else process.env.CONTRACT_RAG_TTL_MINUTES = saved;
    }
  }
  console.log("PASS CONTRACT_RAG_TTL_MINUTES is honored by newly created sessions, never a hardcoded literal");

  // 3. An expired session is rejected by retrieval — status is the same generic session_unavailable, never distinguishing "expired" from "gone".
  {
    const repository = new InMemoryContractRagRepository();
    const backdatedNow = () => new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours in the past
    const indexed = await indexContractSession(
      { maskedDocument: { maskedText: "Section 1: Terms\nThe monthly fee is 100 SAR." }, contractType: "other", analysisLanguage: "en" },
      { repository, embeddingProvider, now: backdatedNow },
    );

    // Default TTL (120 minutes) computed from a clock 24 hours in the past is now, in real time, long expired.
    const response = await retrieveContractContext({ sessionId: indexed.sessionId, query: "monthly fee", language: "en" }, { repository, embeddingProvider });
    assert.equal(response.status, "session_unavailable", "an expired session must never return results");
    assert.deepEqual(response.results, []);

    const session = await repository.getActiveSession(indexed.sessionId);
    assert.equal(session, null, "getActiveSession must return null for an expired session, indistinguishable from nonexistent");
  }
  console.log("PASS an expired session is rejected by retrieval with the same generic session_unavailable status");

  console.log("PASS retrieval.ttl.test.ts");
}

run();
