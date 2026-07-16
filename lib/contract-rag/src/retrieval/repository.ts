import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import type { ContractChunk } from "../chunk/schema";
import type { ContractRagSession, ContractRagSessionStatus } from "../session/schema";

export interface CreateSessionInput {
  sessionId: string;
  contractType: ContractType;
  analysisLanguage: AnalysisLanguage;
  expiresAt: Date;
  sourceFingerprint: string | null;
}

export interface StoredContractChunk extends ContractChunk {
  embedding: number[];
  expiresAt: Date;
}

export interface VectorSearchCandidate {
  chunk: ContractChunk;
  distance: number;
}

export interface DeleteExpiredResult {
  deletedSessionCount: number;
  deletedChunkCount: number;
}

/**
 * Everything Contract RAG needs from storage, expressed so that "expired"
 * and "doesn't exist" are indistinguishable to every caller above this
 * interface — `getActiveSession` returns `null` for both, and every chunk
 * read/write method is hard-scoped to a single `sessionId` so a session can
 * never see another session's data. Implemented by an in-memory fake (unit
 * tests) and a Postgres-backed implementation (production), sharing this
 * exact contract so the two are interchangeable in tests vs. the real app.
 */
export interface ContractRagRepository {
  createSession(input: CreateSessionInput): Promise<void>;

  /** Returns the session only if it exists, is `active`, and has not expired — never distinguishes the reason for a `null` result. */
  getActiveSession(sessionId: string): Promise<ContractRagSession | null>;

  /** Replaces (rather than appends to) a session's chunk set — used once per indexing run, never incrementally. */
  replaceSessionChunks(sessionId: string, chunks: StoredContractChunk[]): Promise<void>;

  /** Cascades to the session's chunks. Safe to call on an already-deleted or nonexistent session id. */
  deleteSession(sessionId: string): Promise<void>;

  /** Vector search hard-scoped to one session; never ranks or returns another session's chunks. */
  vectorSearch(sessionId: string, queryEmbedding: number[], limit: number): Promise<VectorSearchCandidate[]>;

  /** All of a session's chunks, for keyword scoring — hard-scoped to one session. */
  getSessionChunks(sessionId: string): Promise<ContractChunk[]>;

  /** Deletes every expired session (cascading to its chunks) and reports counts only — never contract text. */
  deleteExpired(now: Date): Promise<DeleteExpiredResult>;
}

export type { ContractRagSessionStatus };
