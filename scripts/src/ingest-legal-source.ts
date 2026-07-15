import {
  GeminiEmbeddingProvider,
  ingestSource,
  PostgresLegalChunkRepository,
} from "@workspace/legal-rag";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

/**
 * Minimal CLI: ingests exactly one manifest source by id into the real
 * Postgres/pgvector store, using the real Gemini embedding provider.
 *
 *   pnpm run ingest-legal-source <sourceId>
 *
 * Requires DATABASE_URL (or DIRECT_DATABASE_URL, consumed by @workspace/db)
 * and GEMINI_API_KEY to already be set in the environment — neither is read,
 * echoed, or logged by this script.
 */
async function main(): Promise<void> {
  const sourceId = process.argv[2];
  if (!sourceId) {
    fail("Usage: pnpm run ingest-legal-source <sourceId>");
  }

  const repository = new PostgresLegalChunkRepository();
  const embeddingProvider = new GeminiEmbeddingProvider();

  console.log(`Ingesting "${sourceId}"...`);
  const result = await ingestSource(sourceId, { repository, embeddingProvider });

  console.log(`OK: ingested "${result.sourceId}"`);
  console.log(`  - chunks: ${result.chunkCount}`);
  console.log(`  - embedded (new/changed): ${result.embeddedCount}`);
  console.log(`  - skipped (unchanged): ${result.skippedUnchangedCount}`);
  console.log(`  - flagged for manual review: ${result.manualReviewCount}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
