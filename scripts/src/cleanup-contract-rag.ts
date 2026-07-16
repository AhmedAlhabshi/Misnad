import { cleanupExpiredContractRagData, PostgresContractRagRepository } from "@workspace/contract-rag";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

/**
 * Deletes every expired Contract RAG session and chunk from the real
 * Postgres store and reports counts only — never contract text, never a
 * session or chunk id. Safe to run repeatedly (e.g. on a schedule).
 *
 *   pnpm run cleanup-contract-rag
 *
 * Requires DATABASE_URL (or DIRECT_DATABASE_URL, consumed by @workspace/db)
 * to already be set in the environment — not read, echoed, or logged here.
 */
async function main(): Promise<void> {
  const repository = new PostgresContractRagRepository();

  console.log("Cleaning up expired Contract RAG data...");
  const result = await cleanupExpiredContractRagData({ repository });

  console.log("OK");
  console.log(`  - expired sessions deleted: ${result.deletedSessionCount}`);
  console.log(`  - expired chunks deleted: ${result.deletedChunkCount}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
