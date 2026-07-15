import assert from "node:assert/strict";
import { chunkLegalText, type ChunkSourceMeta } from "../chunk/chunker";
import { FakeEmbeddingProvider } from "../embeddings/fakeEmbeddingProvider";
import type { ContractTypeLegalConfig } from "../registry/contractTypeRegistry";
import { InMemoryLegalChunkRepository } from "../retrieval/inMemoryRepository";
import { retrieveLegalContext } from "../retrieval/service";
import type { LegalSourceDocument } from "../manifest/schema";

async function seed(repository: InMemoryLegalChunkRepository, embeddingProvider: FakeEmbeddingProvider, source: LegalSourceDocument, text: string) {
  const meta: ChunkSourceMeta = {
    sourceId: source.sourceId,
    authority: source.authority,
    documentTitle: source.documentTitleEn ?? source.documentTitleAr,
    contractTypes: source.contractTypes,
    topics: source.topics,
    language: source.language,
    status: source.status,
    effectiveDate: source.effectiveDate,
    officialSourceUrl: source.officialSourceUrl,
  };
  const chunks = chunkLegalText(text, meta);
  const embeddings = await embeddingProvider.embed(chunks.map((c) => c.text), "document");
  await repository.upsertSource(source);
  await repository.replaceSourceChunks(
    source.sourceId,
    chunks.map((chunk, i) => ({ chunk, embedding: embeddings[i] })),
  );
}

function makeSource(overrides: Partial<LegalSourceDocument>): LegalSourceDocument {
  return {
    sourceId: "src",
    collectionId: "coll",
    authority: "sama",
    documentTitleAr: "عنوان",
    documentTitleEn: "Title",
    documentType: "circular",
    officialSourceUrl: "https://rulebook.sama.gov.sa/en/x",
    contractTypes: ["auto_finance"],
    topics: ["fees"],
    jurisdiction: "SA",
    publicationDate: "2020-01-01",
    effectiveDate: "2020-01-01",
    lastVerifiedAt: "2026-07-15",
    status: "active",
    language: "en",
    version: "v1",
    ingestionPath: "x.txt",
    ...overrides,
  };
}

export async function run(): Promise<void> {
  const embeddingProvider = new FakeEmbeddingProvider(48);

  // --- active-status filtering: a repealed source's chunks are never returned ---
  {
    const repository = new InMemoryLegalChunkRepository();
    await seed(
      repository,
      embeddingProvider,
      makeSource({ sourceId: "repealed_src", collectionId: "sama_consumer_finance", status: "repealed" }),
      "Article 9: Fees\n\nAll fees must not exceed 1%.",
    );

    const registry: Record<string, ContractTypeLegalConfig> = {
      auto_finance: { enabled: true, preferredCollections: ["sama_consumer_finance"], fallbackCollections: [], supportedTopics: ["fees"] },
    };

    const response = await retrieveLegalContext(
      { query: "administrative fee maximum", contractType: "auto_finance" as never },
      { repository, embeddingProvider, registry },
    );
    assert.equal(response.status, "insufficient_source", "a repealed source's chunks must never be returned even if otherwise a strong match");
  }
  console.log("PASS active-status filtering excludes a repealed source's chunks");

  // --- contract-type filtering: a chunk not applicable to the requested contract type is excluded ---
  {
    const repository = new InMemoryLegalChunkRepository();
    await seed(
      repository,
      embeddingProvider,
      makeSource({ sourceId: "employment_src", collectionId: "labor_law", contractTypes: ["employment"], topics: ["probation"] }),
      "Article 1: Probation\n\nThe probation period must not exceed 90 days.",
    );

    const registry: Record<string, ContractTypeLegalConfig> = {
      auto_finance: { enabled: true, preferredCollections: ["labor_law"], fallbackCollections: [], supportedTopics: [] },
    };

    const response = await retrieveLegalContext(
      { query: "probation period days", contractType: "auto_finance" as never },
      { repository, embeddingProvider, registry },
    );
    assert.equal(response.status, "insufficient_source", "a chunk whose contractTypes don't include the requested type must never be returned");
  }
  console.log("PASS contract-type filtering excludes chunks not applicable to the requested contract type");

  // --- preferred collection is searched before (and outranks) fallback collection ---
  {
    const repository = new InMemoryLegalChunkRepository();
    await seed(
      repository,
      embeddingProvider,
      makeSource({ sourceId: "preferred_src", collectionId: "sama_consumer_finance", contractTypes: ["auto_finance"], topics: ["fees"] }),
      "Article 9: Fees and Charges\n\nAll fees and administrative charges must not exceed 1% of the amount of financing.",
    );

    const registry: Record<string, ContractTypeLegalConfig> = {
      auto_finance: {
        enabled: true,
        preferredCollections: ["sama_consumer_finance"],
        fallbackCollections: ["civil_transactions"],
        supportedTopics: ["fees"],
      },
    };

    const response = await retrieveLegalContext(
      { query: "administrative fee maximum amount of financing", contractType: "auto_finance" as never },
      { repository, embeddingProvider, registry },
    );
    assert.equal(response.status, "results_found");
    assert.ok(response.results.length > 0, "the preferred collection's chunk must be found without ever needing to fall back");
  }
  console.log("PASS a preferred-collection match is found and returned without falling back");

  // --- fallback collection is only searched when preferred yields nothing ---
  {
    const repository = new InMemoryLegalChunkRepository();
    await seed(
      repository,
      embeddingProvider,
      makeSource({ sourceId: "fallback_src", collectionId: "civil_transactions", contractTypes: ["auto_finance"], topics: [] }),
      "Article 100: General Obligations\n\nA contracting party must perform its obligations in good faith.",
    );

    const registry: Record<string, ContractTypeLegalConfig> = {
      auto_finance: {
        enabled: true,
        preferredCollections: ["sama_consumer_finance"], // empty — nothing seeded here
        fallbackCollections: ["civil_transactions"],
        supportedTopics: [],
      },
    };

    const response = await retrieveLegalContext(
      { query: "general obligations good faith performance", contractType: "auto_finance" as never },
      { repository, embeddingProvider, registry },
    );
    assert.equal(response.status, "results_found", "an empty preferred collection must fall through to the fallback collection");
  }
  console.log("PASS the fallback collection is searched, and returns results, when the preferred collection has nothing");

  // --- insufficient-source: an enabled type with no collections configured at all ---
  {
    const repository = new InMemoryLegalChunkRepository();
    const registry: Record<string, ContractTypeLegalConfig> = {
      other: { enabled: true, preferredCollections: [], fallbackCollections: [], supportedTopics: [] },
    };
    const response = await retrieveLegalContext(
      { query: "anything at all", contractType: "other" as never },
      { repository, embeddingProvider, registry },
    );
    assert.equal(response.status, "insufficient_source");
    assert.deepEqual(response.results, []);
  }
  console.log("PASS a contract type with no configured collections returns insufficient_source, never an empty-but-truthy result");

  console.log("PASS retrieval.filtering.test.ts");
}

run();
