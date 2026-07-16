import assert from "node:assert/strict";
import { FakeEmbeddingProvider } from "@workspace/legal-rag";
import { indexContractSession, InMemoryContractRagRepository } from "@workspace/contract-rag";
import { collectContractEvidence } from "../contractRetriever";

export async function run(): Promise<void> {
  const repository = new InMemoryContractRagRepository();
  const embeddingProvider = new FakeEmbeddingProvider(256);

  const { sessionId } = await indexContractSession(
    {
      maskedDocument: {
        maskedText:
          "Early Termination\nEither party may terminate this lease early by giving sixty (60) days written notice to the other party.\n\nMonthly Rent\nThe tenant shall pay monthly rent of [AMOUNT] SAR on the first day of each month.",
      },
      contractType: "lease",
      analysisLanguage: "en",
    },
    { repository, embeddingProvider },
  );

  // --- Missing session id: skipped, no throw ---
  {
    const outcome = await collectContractEvidence(null, "What does my contract say about early termination?", "en", { repository, embeddingProvider });
    assert.deepEqual(outcome.evidence, []);
    assert.equal(outcome.attempted, false);
    assert.ok(outcome.warnings.some((w) => w.includes("no contractRagSessionId")));
  }
  console.log("PASS collectContractEvidence returns empty evidence and is not marked attempted when no session id is given");

  // --- Missing deps: skipped, no throw ---
  {
    const outcome = await collectContractEvidence(sessionId, "early termination", "en", null);
    assert.deepEqual(outcome.evidence, []);
    assert.equal(outcome.attempted, false);
  }
  console.log("PASS collectContractEvidence returns empty evidence and is not marked attempted when no deps are given");

  // --- Real retrieval: evidence carries verbatim excerpt and correct attribution ---
  {
    const outcome = await collectContractEvidence(sessionId, "early termination notice period", "en", { repository, embeddingProvider });
    assert.equal(outcome.attempted, true);
    assert.ok(outcome.evidence.length > 0, "a relevant question against real indexed chunks must return evidence");
    for (const item of outcome.evidence) {
      assert.equal(item.source, "contract");
      assert.equal(item.authority, "user_contract");
      assert.ok(item.citation.startsWith("Your contract"));
      assert.ok(item.relevanceScore >= 0 && item.relevanceScore <= 1);
      assert.ok(item.excerpt.length > 0);
    }
  }
  console.log("PASS collectContractEvidence maps real retrieval results into correctly-attributed evidence items");

  // --- A question with no relevant chunk anywhere: empty evidence, valid warning, no throw ---
  {
    const outcome = await collectContractEvidence(sessionId, "What is the airspeed velocity of an unladen swallow?", "en", { repository, embeddingProvider });
    assert.equal(outcome.attempted, true);
    assert.deepEqual(outcome.evidence, []);
    assert.ok(outcome.warnings.some((w) => w.includes("contract_evidence_empty")));
  }
  console.log("PASS collectContractEvidence returns empty evidence with a warning when nothing relevant is found");

  console.log("PASS contractRetriever.test.ts");
}

run();
