import type { ContractRagSession } from "../session/schema";
import { cosineDistance } from "./vectorMath";
import type {
  ContractRagRepository,
  CreateSessionInput,
  DeleteExpiredResult,
  StoredContractChunk,
  VectorSearchCandidate,
} from "./repository";

interface InMemorySessionRecord extends ContractRagSession {}

/**
 * Fake, process-local implementation of `ContractRagRepository` for unit
 * tests only — never used in production (production uses
 * `postgresRepository.ts` against Neon, since this app may run on multiple
 * backend instances and an in-process Map cannot be a shared store).
 */
export class InMemoryContractRagRepository implements ContractRagRepository {
  private readonly sessions = new Map<string, InMemorySessionRecord>();
  private readonly chunksBySession = new Map<string, StoredContractChunk[]>();

  async createSession(input: CreateSessionInput): Promise<void> {
    this.sessions.set(input.sessionId, {
      sessionId: input.sessionId,
      contractType: input.contractType,
      analysisLanguage: input.analysisLanguage,
      createdAt: new Date(),
      expiresAt: input.expiresAt,
      status: "active",
      chunkCount: 0,
      sourceFingerprint: input.sourceFingerprint,
    });
    this.chunksBySession.set(input.sessionId, []);
  }

  async getActiveSession(sessionId: string): Promise<ContractRagSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.status !== "active") return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    return session;
  }

  async replaceSessionChunks(sessionId: string, chunks: StoredContractChunk[]): Promise<void> {
    this.chunksBySession.set(sessionId, chunks);
    const session = this.sessions.get(sessionId);
    if (session) {
      session.chunkCount = chunks.length;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    this.chunksBySession.delete(sessionId);
  }

  async vectorSearch(sessionId: string, queryEmbedding: number[], limit: number): Promise<VectorSearchCandidate[]> {
    const chunks = this.chunksBySession.get(sessionId) ?? [];
    return chunks
      .map((chunk) => ({ chunk, distance: cosineDistance(chunk.embedding, queryEmbedding) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }

  async getSessionChunks(sessionId: string): Promise<StoredContractChunk[]> {
    return this.chunksBySession.get(sessionId) ?? [];
  }

  async deleteExpired(now: Date): Promise<DeleteExpiredResult> {
    let deletedSessionCount = 0;
    let deletedChunkCount = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt.getTime() <= now.getTime()) {
        deletedChunkCount += this.chunksBySession.get(sessionId)?.length ?? 0;
        this.chunksBySession.delete(sessionId);
        this.sessions.delete(sessionId);
        deletedSessionCount += 1;
      }
    }
    return { deletedSessionCount, deletedChunkCount };
  }
}
