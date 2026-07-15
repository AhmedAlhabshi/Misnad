import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FakeEmbeddingProvider } from "../embeddings/fakeEmbeddingProvider";
import { ingestSource } from "../ingestion/orchestrate";
import type { LegalSourceDocument } from "../manifest/schema";
import { InMemoryLegalChunkRepository } from "../retrieval/inMemoryRepository";

function makeSource(overrides: Partial<LegalSourceDocument> = {}): LegalSourceDocument {
  return {
    sourceId: "test_ingest_source",
    collectionId: "test_collection",
    authority: "sama",
    documentTitleAr: "عنوان تجريبي",
    documentTitleEn: "Test Source",
    documentType: "circular",
    officialSourceUrl: "https://rulebook.sama.gov.sa/en/test",
    contractTypes: ["auto_finance"],
    topics: ["fees"],
    jurisdiction: "SA",
    publicationDate: "2020-01-01",
    effectiveDate: "2020-01-01",
    lastVerifiedAt: "2026-07-15",
    status: "active",
    language: "en",
    version: "v1",
    ingestionPath: "source.txt",
    ...overrides,
  };
}

export async function run(): Promise<void> {
  const tempDir = mkdtempSync(path.join(tmpdir(), "legal-rag-ingestion-test-"));

  // --- Real, real-world-shaped text: first ingestion embeds every chunk ---
  {
    const filePath = path.join(tempDir, "source.txt");
    writeFileSync(
      filePath,
      "Article 9: Fees and Charges\n\nAll fees must not exceed 1% of the amount of financing.\n\nArticle 11: Early Payments\n\nThe borrower may prepay at any time.",
      "utf8",
    );
    const manifest = [makeSource()];
    const repository = new InMemoryLegalChunkRepository();
    const embeddingProvider = new FakeEmbeddingProvider(32);

    const result = await ingestSource("test_ingest_source", { repository, embeddingProvider, manifest, packageRoot: tempDir });

    assert.equal(result.chunkCount, 2);
    assert.equal(result.embeddedCount, 2, "every chunk must be embedded on first ingestion");
    assert.equal(result.skippedUnchangedCount, 0);
    assert.equal(result.manualReviewCount, 0);

    const fingerprints = await repository.getExistingChunkFingerprints("test_ingest_source");
    assert.equal(fingerprints.size, 2);

    // --- Re-ingesting identical text must skip re-embedding every chunk ---
    const second = await ingestSource("test_ingest_source", { repository, embeddingProvider, manifest, packageRoot: tempDir });
    assert.equal(second.chunkCount, 2);
    assert.equal(second.embeddedCount, 0, "no chunk text changed — nothing should be re-embedded");
    assert.equal(second.skippedUnchangedCount, 2, "both unchanged chunks must be skipped");
  }
  console.log("PASS first ingestion embeds every chunk; re-ingesting identical text skips re-embedding all of them");

  // --- Changing only one article's text re-embeds only that one chunk ---
  {
    const filePath = path.join(tempDir, "source.txt");
    writeFileSync(
      filePath,
      "Article 9: Fees and Charges\n\nAll fees must not exceed 2% of the amount of financing.\n\nArticle 11: Early Payments\n\nThe borrower may prepay at any time.",
      "utf8",
    );
    const manifest = [makeSource()];
    const repository = new InMemoryLegalChunkRepository();
    const embeddingProvider = new FakeEmbeddingProvider(32);

    await ingestSource("test_ingest_source", {
      repository,
      embeddingProvider,
      manifest: [makeSource()],
      packageRoot: tempDir,
    });
    // Simulate that Article 9's text changed since the last ingestion by re-ingesting after the edit above
    // was already written to disk before this second call — so this call IS the "changed" ingestion.
    writeFileSync(
      filePath,
      "Article 9: Fees and Charges\n\nAll fees must not exceed 3% of the amount of financing.\n\nArticle 11: Early Payments\n\nThe borrower may prepay at any time.",
      "utf8",
    );
    const result = await ingestSource("test_ingest_source", { repository, embeddingProvider, manifest, packageRoot: tempDir });
    assert.equal(result.embeddedCount, 1, "only the changed article must be re-embedded");
    assert.equal(result.skippedUnchangedCount, 1, "the unchanged article must be skipped");
  }
  console.log("PASS changing only one article's text re-embeds only that one chunk, skipping its unchanged sibling");

  // --- Unknown sourceId throws rather than silently doing nothing ---
  {
    let threw = false;
    try {
      await ingestSource("does_not_exist", {
        repository: new InMemoryLegalChunkRepository(),
        embeddingProvider: new FakeEmbeddingProvider(32),
        manifest: [makeSource()],
        packageRoot: tempDir,
      });
    } catch {
      threw = true;
    }
    assert.ok(threw, "ingesting an unknown sourceId must throw, not silently no-op");
  }
  console.log("PASS ingesting an unknown sourceId throws");

  // --- Corrupted/too-short text fails the quality check and is never ingested ---
  {
    const badPath = path.join(tempDir, "bad.txt");
    writeFileSync(badPath, "�", "utf8");
    const manifest = [makeSource({ sourceId: "bad_source", ingestionPath: "bad.txt" })];
    const repository = new InMemoryLegalChunkRepository();

    let threw = false;
    try {
      await ingestSource("bad_source", { repository, embeddingProvider: new FakeEmbeddingProvider(32), manifest, packageRoot: tempDir });
    } catch {
      threw = true;
    }
    assert.ok(threw, "corrupted/too-short text must fail the quality check and never be ingested");

    const fingerprints = await repository.getExistingChunkFingerprints("bad_source");
    assert.equal(fingerprints.size, 0, "a failed ingestion must leave no partial chunks behind");
  }
  console.log("PASS corrupted/mojibake text fails the quality check and is never silently ingested");

  console.log("PASS ingestion.orchestrate.test.ts");
}

run();
