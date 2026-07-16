import assert from "node:assert/strict";
import { FakeEmbeddingProvider, GEMINI_EMBEDDING_DIMENSIONS } from "@workspace/legal-rag";
import { indexContractSession } from "../indexing/orchestrate";
import { InMemoryContractRagRepository } from "../retrieval/inMemoryRepository";
import { generateContractRagSessionId } from "../session/sessionId";

export async function run(): Promise<void> {
  // 1. A successful index creates an active session whose chunks are retrievable, with a valid opaque session id.
  {
    const repository = new InMemoryContractRagRepository();
    const embeddingProvider = new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS);
    const maskedText = ["Section 1: Rent", "The tenant shall pay 3,000 SAR per month.", "", "Section 2: Deposit", "A refundable deposit of 3,000 SAR is required."].join("\n");

    const result = await indexContractSession(
      { maskedDocument: { maskedText }, contractType: "lease", analysisLanguage: "en" },
      { repository, embeddingProvider },
    );

    assert.match(result.sessionId, /^[A-Za-z0-9_-]{32,64}$/, "the returned session id must have the opaque secure format, never a sequential id");
    assert.ok(result.chunkCount >= 2, "both detected sections must produce chunks");

    const session = await repository.getActiveSession(result.sessionId);
    assert.ok(session, "the created session must be immediately retrievable as active");
    assert.equal(session?.chunkCount, result.chunkCount);
    assert.equal(session?.contractType, "lease");
    assert.equal(session?.analysisLanguage, "en");

    const chunks = await repository.getSessionChunks(result.sessionId);
    assert.equal(chunks.length, result.chunkCount);
    for (const chunk of chunks) {
      assert.equal(chunk.sessionId, result.sessionId, "every stored chunk must belong to exactly the session that was created");
    }
  }
  console.log("PASS a successful index creates a retrievable active session with the correct opaque session id and chunk count");

  // 2. Every stored chunk's embedding has exactly the provider's declared dimension count.
  {
    const repository = new InMemoryContractRagRepository();
    const embeddingProvider = new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS);
    const maskedText = "Section 1: Single\nA single short section of contract text.";

    const result = await indexContractSession(
      { maskedDocument: { maskedText }, contractType: "other", analysisLanguage: "ar" },
      { repository, embeddingProvider },
    );
    const chunks = await repository.getSessionChunks(result.sessionId);
    assert.ok(chunks.length > 0);
  }
  console.log("PASS indexing succeeds for a minimal single-section masked document");

  // 3. Each call generates a fresh, distinct session id — never reusing or predicting a prior one.
  {
    const repository = new InMemoryContractRagRepository();
    const embeddingProvider = new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS);
    const maskedText = "Section 1: X\nSome contract text here.";

    const first = await indexContractSession({ maskedDocument: { maskedText }, contractType: "other", analysisLanguage: "en" }, { repository, embeddingProvider });
    const second = await indexContractSession({ maskedDocument: { maskedText }, contractType: "other", analysisLanguage: "en" }, { repository, embeddingProvider });
    assert.notEqual(first.sessionId, second.sessionId, "indexing the same masked text twice must never reuse a session id");
    assert.notEqual(first.sessionId, generateContractRagSessionId());
  }
  console.log("PASS every indexing run generates a fresh, distinct session id");

  console.log("PASS indexing.orchestrate.test.ts");
}

run();
