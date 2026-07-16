import assert from "node:assert/strict";
import { FakeEmbeddingProvider, GEMINI_EMBEDDING_DIMENSIONS } from "@workspace/legal-rag";
import { indexContractSession } from "../indexing/orchestrate";
import { InMemoryContractRagRepository } from "../retrieval/inMemoryRepository";
import { retrieveContractContext } from "../retrieval/service";

export async function run(): Promise<void> {
  // 1. A financial keyword question (exact-phrase-friendly) surfaces the chunk that actually contains the answer.
  {
    const repository = new InMemoryContractRagRepository();
    const embeddingProvider = new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS);
    const maskedText = [
      "Section 1: General",
      "This agreement governs the financing of a vehicle between the two parties.",
      "",
      "Section 2: Monthly Installment",
      "The borrower shall pay a monthly installment of 2,400 SAR on the first of each month.",
      "",
      "Section 3: Insurance",
      "The borrower must maintain comprehensive insurance on the vehicle for the full term.",
    ].join("\n");

    const indexed = await indexContractSession({ maskedDocument: { maskedText }, contractType: "auto_finance", analysisLanguage: "en" }, { repository, embeddingProvider });

    const response = await retrieveContractContext(
      { sessionId: indexed.sessionId, query: "how much do I pay monthly, what is the monthly installment", language: "en" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    assert.ok(response.results.length > 0);
    assert.equal(response.results[0].section, "Section 2", "the top result must be the chunk that actually answers the monthly-payment question");
  }
  console.log("PASS a financial keyword question surfaces the chunk that actually answers it, ranked first");

  // 2. An exact selected-clause-title match is boosted to the top even against a more vector-similar competing chunk.
  {
    const repository = new InMemoryContractRagRepository();
    const embeddingProvider = new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS);
    const maskedText = [
      "Section 1: Early Termination",
      "Either party may terminate this agreement early with 30 days written notice and a termination fee of 500 SAR.",
      "",
      "Section 2: Insurance",
      "The tenant must maintain insurance covering fire and theft for the duration of the lease.",
    ].join("\n");
    const indexed = await indexContractSession({ maskedDocument: { maskedText }, contractType: "lease", analysisLanguage: "en" }, { repository, embeddingProvider });

    const response = await retrieveContractContext(
      { sessionId: indexed.sessionId, query: "tell me more about this", selectedClauseTitle: "Section 1", language: "en" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    assert.equal(response.results[0].section, "Section 1", "an exact selectedClauseTitle match must be boosted to the top result");
  }
  console.log("PASS an exact selectedClauseTitle match is boosted to the top result");

  // 3. A query with no relevant content in the contract returns insufficient_contract_context, never padded with unrelated chunks.
  {
    const repository = new InMemoryContractRagRepository();
    const embeddingProvider = new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS);
    const maskedText = "Section 1: Vehicle Description\nThe vehicle is a 2024 sedan, white, four doors.";
    const indexed = await indexContractSession({ maskedDocument: { maskedText }, contractType: "auto_finance", analysisLanguage: "en" }, { repository, embeddingProvider });

    const response = await retrieveContractContext(
      { sessionId: indexed.sessionId, query: "quantum physics nuclear reactor thermodynamics entropy", language: "en" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "insufficient_contract_context");
    assert.deepEqual(response.results, []);
  }
  console.log("PASS an unrelated query returns insufficient_contract_context with no padded results");

  // 4. Results are bounded by topK/config and never exceed the configured max.
  {
    const repository = new InMemoryContractRagRepository();
    const embeddingProvider = new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS);
    const sections = Array.from({ length: 15 }, (_, i) => `Section ${i + 1}: Payment\nThe party shall pay a fee of ${100 + i} SAR for item ${i}.`);
    const indexed = await indexContractSession(
      { maskedDocument: { maskedText: sections.join("\n\n") }, contractType: "other", analysisLanguage: "en" },
      { repository, embeddingProvider },
    );

    const response = await retrieveContractContext({ sessionId: indexed.sessionId, query: "fee payment SAR", topK: 3, language: "en" }, { repository, embeddingProvider });
    assert.equal(response.status, "results_found");
    assert.ok(response.results.length <= 3, "requested topK must bound the number of returned results");
  }
  console.log("PASS results are bounded by the requested/configured topK");

  console.log("PASS retrieval.hybrid.test.ts");
}

run();
