import assert from "node:assert/strict";
import { FakeEmbeddingProvider, GEMINI_EMBEDDING_DIMENSIONS } from "@workspace/legal-rag";
import { cleanupExpiredContractRagData } from "../cleanup";
import { indexContractSession } from "../indexing/orchestrate";
import { InMemoryContractRagRepository } from "../retrieval/inMemoryRepository";

export async function run(): Promise<void> {
  const embeddingProvider = new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS);

  // 1. Cleanup removes only expired sessions/chunks, never active ones, and reports accurate counts.
  {
    const repository = new InMemoryContractRagRepository();
    const backdatedNow = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

    const expired = await indexContractSession(
      { maskedDocument: { maskedText: "Section 1: Old\nThis session must expire." }, contractType: "other", analysisLanguage: "en" },
      { repository, embeddingProvider, now: backdatedNow },
    );
    const active = await indexContractSession(
      { maskedDocument: { maskedText: "Section 1: New\nThis session must remain active." }, contractType: "other", analysisLanguage: "en" },
      { repository, embeddingProvider },
    );

    const expiredChunksBefore = (await repository.getSessionChunks(expired.sessionId)).length;
    assert.ok(expiredChunksBefore > 0);

    const result = await cleanupExpiredContractRagData({ repository });
    assert.equal(result.deletedSessionCount, 1, "exactly one expired session must be deleted");
    assert.equal(result.deletedChunkCount, expiredChunksBefore, "the reported chunk count must match the expired session's actual chunk count");

    assert.equal(await repository.getActiveSession(expired.sessionId), null, "the expired session must be gone after cleanup");
    assert.deepEqual(await repository.getSessionChunks(expired.sessionId), [], "the expired session's chunks must be gone after cleanup");

    const activeSession = await repository.getActiveSession(active.sessionId);
    assert.ok(activeSession, "an active, non-expired session must survive cleanup untouched");
    const activeChunks = await repository.getSessionChunks(active.sessionId);
    assert.ok(activeChunks.length > 0, "an active session's chunks must survive cleanup untouched");
  }
  console.log("PASS cleanup deletes only expired sessions/chunks and reports accurate counts, leaving active data untouched");

  // 2. Cleanup is safe to run repeatedly: a second run with nothing expired reports zero counts, no error.
  {
    const repository = new InMemoryContractRagRepository();
    const first = await cleanupExpiredContractRagData({ repository });
    assert.equal(first.deletedSessionCount, 0);
    assert.equal(first.deletedChunkCount, 0);
    const second = await cleanupExpiredContractRagData({ repository });
    assert.equal(second.deletedSessionCount, 0);
    assert.equal(second.deletedChunkCount, 0);
  }
  console.log("PASS cleanup is safe to run repeatedly on an empty/already-clean store");

  console.log("PASS cleanup.test.ts");
}

run();
