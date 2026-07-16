import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import { db } from "@workspace/db";
import { contractRagChunks, contractRagSessions } from "@workspace/db/schema";
import { and, cosineDistance, eq, lte } from "drizzle-orm";
import type { ContractChunk } from "../chunk/schema";
import type { ContractRagSession } from "../session/schema";
import type {
  ContractRagRepository,
  CreateSessionInput,
  DeleteExpiredResult,
  StoredContractChunk,
  VectorSearchCandidate,
} from "./repository";

function rowToChunk(row: typeof contractRagChunks.$inferSelect): ContractChunk {
  return {
    chunkId: row.chunkId,
    sessionId: row.sessionId,
    chunkOrder: row.chunkOrder,
    section: row.section,
    text: row.text,
    topics: row.topics,
    checksum: row.checksum,
    needsManualReview: row.needsManualReview,
  };
}

function rowToSession(row: typeof contractRagSessions.$inferSelect): ContractRagSession {
  return {
    sessionId: row.sessionId,
    contractType: row.contractType as ContractType,
    analysisLanguage: row.analysisLanguage as AnalysisLanguage,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    status: row.status as ContractRagSession["status"],
    chunkCount: row.chunkCount,
    sourceFingerprint: row.sourceFingerprint,
  };
}

/**
 * Production `ContractRagRepository` implementation, backed by
 * `@workspace/db` + pgvector — a shared Neon store so Contract RAG works
 * correctly across multiple backend instances (never an in-process Map).
 * Structurally unrelated to `PostgresLegalChunkRepository`: separate
 * tables (`contract_rag_sessions`/`contract_rag_chunks`), no collection
 * scoping, and every read is hard-filtered to exactly one `sessionId`.
 */
export class PostgresContractRagRepository implements ContractRagRepository {
  async createSession(input: CreateSessionInput): Promise<void> {
    await db.insert(contractRagSessions).values({
      sessionId: input.sessionId,
      contractType: input.contractType,
      analysisLanguage: input.analysisLanguage,
      status: "active",
      chunkCount: 0,
      sourceFingerprint: input.sourceFingerprint,
      expiresAt: input.expiresAt,
    });
  }

  async getActiveSession(sessionId: string): Promise<ContractRagSession | null> {
    const rows = await db
      .select()
      .from(contractRagSessions)
      .where(and(eq(contractRagSessions.sessionId, sessionId), eq(contractRagSessions.status, "active")))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return rowToSession(row);
  }

  async replaceSessionChunks(sessionId: string, chunks: StoredContractChunk[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(contractRagChunks).where(eq(contractRagChunks.sessionId, sessionId));
      if (chunks.length > 0) {
        await tx.insert(contractRagChunks).values(
          chunks.map((chunk) => ({
            chunkId: chunk.chunkId,
            sessionId: chunk.sessionId,
            chunkOrder: chunk.chunkOrder,
            section: chunk.section,
            text: chunk.text,
            topics: chunk.topics,
            checksum: chunk.checksum,
            needsManualReview: chunk.needsManualReview,
            embedding: chunk.embedding,
            expiresAt: chunk.expiresAt,
          })),
        );
      }
      await tx.update(contractRagSessions).set({ chunkCount: chunks.length }).where(eq(contractRagSessions.sessionId, sessionId));
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    // The chunk table's FK is ON DELETE CASCADE, so this alone removes the
    // session's chunks too; deleting chunks first as well is redundant but
    // harmless defense-in-depth against a future schema change dropping the cascade.
    await db.transaction(async (tx) => {
      await tx.delete(contractRagChunks).where(eq(contractRagChunks.sessionId, sessionId));
      await tx.delete(contractRagSessions).where(eq(contractRagSessions.sessionId, sessionId));
    });
  }

  async vectorSearch(sessionId: string, queryEmbedding: number[], limit: number): Promise<VectorSearchCandidate[]> {
    const distanceExpr = cosineDistance(contractRagChunks.embedding, queryEmbedding);
    const rows = await db
      .select({ chunk: contractRagChunks, distance: distanceExpr })
      .from(contractRagChunks)
      .where(eq(contractRagChunks.sessionId, sessionId))
      .orderBy(distanceExpr)
      .limit(limit);

    return rows.map((row) => ({ chunk: rowToChunk(row.chunk), distance: Number(row.distance) }));
  }

  async getSessionChunks(sessionId: string): Promise<ContractChunk[]> {
    const rows = await db.select().from(contractRagChunks).where(eq(contractRagChunks.sessionId, sessionId));
    return rows.map(rowToChunk);
  }

  async deleteExpired(now: Date): Promise<DeleteExpiredResult> {
    return db.transaction(async (tx) => {
      const expiredChunkRows = await tx
        .delete(contractRagChunks)
        .where(lte(contractRagChunks.expiresAt, now))
        .returning({ chunkId: contractRagChunks.chunkId });

      const expiredSessionRows = await tx
        .delete(contractRagSessions)
        .where(lte(contractRagSessions.expiresAt, now))
        .returning({ sessionId: contractRagSessions.sessionId });

      return {
        deletedSessionCount: expiredSessionRows.length,
        deletedChunkCount: expiredChunkRows.length,
      };
    });
  }
}
