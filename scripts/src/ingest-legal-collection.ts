import {
  GeminiEmbeddingProvider,
  ingestSource,
  LEGAL_SOURCE_MANIFEST,
  PostgresLegalChunkRepository,
} from "@workspace/legal-rag";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

/**
 * Batch CLI: ingests every manifest source belonging to one named
 * collection into the real Postgres/pgvector store, using the real Gemini
 * embedding provider. Wraps the exact same `ingestSource` function the
 * single-source CLI (`ingest-legal-source`) uses — never a separate
 * ingestion mechanism per authority/collection.
 *
 *   pnpm run ingest-legal-collection <collectionId>
 *
 * One source failing does not stop the rest of the collection from being
 * attempted; each source's own idempotent checksum-based skip logic
 * (inside `ingestSource`) already makes re-running this safe/repeatable.
 *
 * Requires DATABASE_URL (or DIRECT_DATABASE_URL, consumed by @workspace/db)
 * and GEMINI_API_KEY to already be set in the environment — neither is read,
 * echoed, or logged by this script.
 */
async function main(): Promise<void> {
  const collectionId = process.argv[2];
  if (!collectionId) {
    fail("Usage: pnpm run ingest-legal-collection <collectionId>");
  }

  const sources = LEGAL_SOURCE_MANIFEST.filter((s) => s.collectionId === collectionId);
  if (sources.length === 0) {
    fail(`No manifest sources found for collectionId "${collectionId}"`);
  }

  const repository = new PostgresLegalChunkRepository();
  const embeddingProvider = new GeminiEmbeddingProvider();

  console.log(`Ingesting collection "${collectionId}" (${sources.length} source(s))...`);

  let totalChunks = 0;
  let totalEmbedded = 0;
  let totalSkipped = 0;
  let totalManualReview = 0;
  let failureCount = 0;

  for (const source of sources) {
    try {
      const result = await ingestSource(source.sourceId, { repository, embeddingProvider });
      totalChunks += result.chunkCount;
      totalEmbedded += result.embeddedCount;
      totalSkipped += result.skippedUnchangedCount;
      totalManualReview += result.manualReviewCount;
      console.log(
        `  OK: ${result.sourceId} — chunks: ${result.chunkCount}, embedded: ${result.embeddedCount}, skipped: ${result.skippedUnchangedCount}, manual review: ${result.manualReviewCount}`,
      );
    } catch (error) {
      failureCount += 1;
      console.error(`  FAIL: ${source.sourceId} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Done: ${sources.length - failureCount}/${sources.length} source(s) ingested successfully.`);
  console.log(`  total chunks: ${totalChunks}`);
  console.log(`  total embedded (new/changed): ${totalEmbedded}`);
  console.log(`  total skipped (unchanged): ${totalSkipped}`);
  console.log(`  total flagged for manual review: ${totalManualReview}`);

  if (failureCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
