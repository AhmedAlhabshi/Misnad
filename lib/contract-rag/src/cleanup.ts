import type { ContractRagRepository, DeleteExpiredResult } from "./retrieval/repository";

export interface CleanupContractRagDeps {
  repository: ContractRagRepository;
  /** Injectable so tests can assert a fixed clock; defaults to `Date.now`. */
  now?: () => Date;
}

/**
 * Deletes every expired Contract RAG session (cascading to its chunks) and
 * every independently-expired chunk, and reports counts only — never
 * contract text, never a chunk id, never a session id. Safe to call
 * repeatedly (a session/chunk already gone is simply not counted again).
 * The reusable core of `scripts/src/cleanup-contract-rag.ts`; also intended
 * for future scheduled/cron execution.
 */
export async function cleanupExpiredContractRagData(deps: CleanupContractRagDeps): Promise<DeleteExpiredResult> {
  const now = deps.now ? deps.now() : new Date();
  return deps.repository.deleteExpired(now);
}
