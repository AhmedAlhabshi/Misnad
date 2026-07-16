import assert from "node:assert/strict";
import { FakeEmbeddingProvider, GEMINI_EMBEDDING_DIMENSIONS } from "@workspace/legal-rag";
import { indexContractSession } from "../indexing/orchestrate";
import { InMemoryContractRagRepository } from "../retrieval/inMemoryRepository";
import { retrieveContractContext } from "../retrieval/service";

export async function run(): Promise<void> {
  const repository = new InMemoryContractRagRepository();
  const embeddingProvider = new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS);

  const sessionA = await indexContractSession(
    {
      maskedDocument: { maskedText: "Section 1: Rent\nThe tenant of contract A shall pay 4,000 SAR per month for the apartment lease." },
      contractType: "lease",
      analysisLanguage: "en",
    },
    { repository, embeddingProvider },
  );
  const sessionB = await indexContractSession(
    {
      maskedDocument: { maskedText: "Section 1: Salary\nThe employee of contract B shall receive a monthly salary of 4,000 SAR." },
      contractType: "employment",
      analysisLanguage: "en",
    },
    { repository, embeddingProvider },
  );

  // 1. A query against session A never returns session B's chunks, even when the wording overlaps heavily (both mention "4,000 SAR per month").
  {
    const response = await retrieveContractContext(
      { sessionId: sessionA.sessionId, query: "monthly amount 4,000 SAR", language: "en" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    for (const result of response.results) {
      assert.ok(!result.excerpt.includes("employee"), "session A's results must never include session B's contract text");
      assert.ok(!result.excerpt.includes("contract B"));
    }
  }
  console.log("PASS retrieval for session A never returns session B's chunks, even with overlapping vocabulary");

  // 2. The reverse: querying session B never returns session A's chunks.
  {
    const response = await retrieveContractContext(
      { sessionId: sessionB.sessionId, query: "monthly amount 4,000 SAR", language: "en" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    for (const result of response.results) {
      assert.ok(!result.excerpt.includes("tenant"));
      assert.ok(!result.excerpt.includes("contract A"));
    }
  }
  console.log("PASS retrieval for session B never returns session A's chunks");

  // 3. A well-formed but nonexistent session id is indistinguishable from an expired/foreign one: same generic status.
  {
    const { generateContractRagSessionId } = await import("../session/sessionId");
    const response = await retrieveContractContext(
      { sessionId: generateContractRagSessionId(), query: "anything", language: "en" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "session_unavailable");
    assert.deepEqual(response.results, []);
  }
  console.log("PASS a well-formed but nonexistent session id returns the same generic session_unavailable status");

  console.log("PASS retrieval.isolation.test.ts");
}

run();
