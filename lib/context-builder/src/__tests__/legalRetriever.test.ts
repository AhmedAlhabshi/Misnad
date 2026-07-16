import assert from "node:assert/strict";
import { FakeEmbeddingProvider, ingestSource, InMemoryLegalChunkRepository, LEGAL_SOURCE_MANIFEST } from "@workspace/legal-rag";
import { collectLegalEvidence } from "../legalRetriever";

export async function run(): Promise<void> {
  const repository = new InMemoryLegalChunkRepository();
  const embeddingProvider = new FakeEmbeddingProvider(256);
  await ingestSource("sama_regulations_consumer_financing", { repository, embeddingProvider, manifest: LEGAL_SOURCE_MANIFEST });

  // --- Missing deps: skipped, no throw ---
  {
    const outcome = await collectLegalEvidence("What is the maximum administrative fee?", "auto_finance", null);
    assert.deepEqual(outcome.evidence, []);
    assert.equal(outcome.attempted, false);
  }
  console.log("PASS collectLegalEvidence returns empty evidence and is not marked attempted when no deps are given");

  // --- Real retrieval: evidence carries verbatim excerpt, real citation URL, and preserved authority ---
  {
    const outcome = await collectLegalEvidence("What is the maximum administrative fee a creditor can charge?", "auto_finance", { repository, embeddingProvider });
    assert.equal(outcome.attempted, true);
    assert.ok(outcome.evidence.length > 0, "a relevant question against a real ingested legal source must return evidence");
    for (const item of outcome.evidence) {
      assert.equal(item.source, "legal");
      assert.ok(item.authority.length > 0, "authority must be preserved from the real chunk, never invented");
      assert.ok(item.citation.startsWith("https://"), "citation must be a real official source URL, never fabricated");
      assert.ok(item.relevanceScore >= 0 && item.relevanceScore <= 1);
      assert.ok(item.excerpt.length > 0);
    }
  }
  console.log("PASS collectLegalEvidence maps real retrieval results into correctly-attributed evidence items with real citations");

  // --- A contract type / query with no matching collection: empty evidence, warning, no throw ---
  {
    const outcome = await collectLegalEvidence("random unrelated question about nothing in particular", "subscription", { repository, embeddingProvider });
    assert.equal(outcome.attempted, true);
    assert.deepEqual(outcome.evidence, []);
    assert.ok(outcome.warnings.some((w) => w.includes("legal_evidence_empty")));
  }
  console.log("PASS collectLegalEvidence returns empty evidence with a warning when nothing relevant is found");

  console.log("PASS legalRetriever.test.ts");
}

run();
