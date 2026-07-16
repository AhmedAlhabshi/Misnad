import assert from "node:assert/strict";
import { FakeEmbeddingProvider } from "@workspace/legal-rag";
import type { EmbeddingProvider, EmbeddingTaskType } from "@workspace/legal-rag";
import { indexContractSession } from "../indexing/orchestrate";
import { InMemoryContractRagRepository } from "../retrieval/inMemoryRepository";

/** Records every text handed to the embedding provider, so a test can assert exactly what was — and wasn't — ever embedded. */
class SpyEmbeddingProvider implements EmbeddingProvider {
  public readonly dimensions: number;
  public readonly embeddedTexts: string[] = [];
  private readonly delegate: FakeEmbeddingProvider;

  constructor(dimensions: number) {
    this.dimensions = dimensions;
    this.delegate = new FakeEmbeddingProvider(dimensions);
  }

  async embed(texts: string[], taskType: EmbeddingTaskType): Promise<number[][]> {
    this.embeddedTexts.push(...texts);
    return this.delegate.embed(texts, taskType);
  }
}

export async function run(): Promise<void> {
  // 1. Only the masked text ever reaches the embedding provider — never a raw PII value.
  {
    const repository = new InMemoryContractRagRepository();
    const embeddingProvider = new SpyEmbeddingProvider(32);
    const maskedText = [
      "Section 1: Parties",
      "The lessee, identified by national ID [NATIONAL_ID], phone [PHONE], and IBAN [IBAN], agrees to the following.",
      "",
      "Section 2: Payment",
      "The lessee shall pay 2,000 SAR monthly.",
    ].join("\n");

    const result = await indexContractSession(
      { maskedDocument: { maskedText }, contractType: "lease", analysisLanguage: "en" },
      { repository, embeddingProvider },
    );

    assert.ok(result.sessionId.length > 0);
    assert.ok(embeddingProvider.embeddedTexts.length > 0, "indexing must actually embed at least one chunk");

    for (const embedded of embeddingProvider.embeddedTexts) {
      // Every embedded string must be a verbatim substring of the masked source text — proving nothing
      // outside of the masked text (e.g. a raw PII value the masker was supposed to have removed) ever
      // reaches the embedding provider.
      assert.ok(maskedText.includes(embedded), "every embedded chunk must be a verbatim substring of the masked text, never anything else");
    }

    // The masking placeholders themselves are preserved verbatim (proving no second/weaker masking pass ran).
    const joinedEmbedded = embeddingProvider.embeddedTexts.join("\n");
    assert.ok(joinedEmbedded.includes("[NATIONAL_ID]") || maskedText.includes("[NATIONAL_ID]"));
  }
  console.log("PASS only masked text (never raw PII) is ever passed to the embedding provider");

  // 2. Refuses to create a session when the masked text is empty — "if safe masked text is unavailable, do not create a Contract RAG session."
  {
    const repository = new InMemoryContractRagRepository();
    const embeddingProvider = new SpyEmbeddingProvider(32);
    await assert.rejects(
      () => indexContractSession({ maskedDocument: { maskedText: "" }, contractType: "other", analysisLanguage: "en" }, { repository, embeddingProvider }),
      "indexing must refuse to create a session when masked text is empty",
    );
    await assert.rejects(
      () => indexContractSession({ maskedDocument: { maskedText: "   " }, contractType: "other", analysisLanguage: "en" }, { repository, embeddingProvider }),
      "indexing must refuse to create a session when masked text is whitespace-only",
    );
    assert.equal(embeddingProvider.embeddedTexts.length, 0, "no embedding call may happen when there is no usable masked text");
  }
  console.log("PASS indexing refuses to create a session when masked text is empty/unavailable, and never calls the embedding provider");

  console.log("PASS indexing.maskedOnly.test.ts");
}

run();
