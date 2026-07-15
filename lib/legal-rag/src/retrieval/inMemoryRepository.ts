import type { EmbeddedLegalChunk } from "../chunk/schema";
import type { LegalSourceDocument } from "../manifest/schema";
import { keywordMatchScore } from "./keywordMatch";
import type {
  CollectionScopedSearchParams,
  KeywordSearchHit,
  LegalChunkRepository,
  VectorSearchHit,
} from "./repository";
import { cosineDistance } from "./vectorMath";

/**
 * Fully in-memory implementation of `LegalChunkRepository` — used by every
 * test in this package (so tests never require a live database or real
 * Gemini) and, per the database-blocker fallback in the phase brief, as the
 * documented stand-in until `DATABASE_URL`/pgvector are provisioned. It is
 * NOT a production storage strategy: each `api-server` instance would have
 * its own independent copy, which is unacceptable for a shared legal
 * knowledge base under Replit's autoscale deployment target (see the
 * architecture plan, §12.10) — the Postgres implementation
 * (`postgresRepository.ts`) is the intended production path.
 */
export class InMemoryLegalChunkRepository implements LegalChunkRepository {
  private readonly sources = new Map<string, LegalSourceDocument>();
  private readonly chunksBySource = new Map<string, EmbeddedLegalChunk[]>();

  async getExistingChunkFingerprints(sourceId: string): Promise<Map<string, { checksum: string; embedding: number[] }>> {
    const map = new Map<string, { checksum: string; embedding: number[] }>();
    for (const entry of this.chunksBySource.get(sourceId) ?? []) {
      map.set(entry.chunk.chunkId, { checksum: entry.chunk.checksum, embedding: entry.embedding });
    }
    return map;
  }

  async upsertSource(source: LegalSourceDocument): Promise<void> {
    this.sources.set(source.sourceId, source);
  }

  async replaceSourceChunks(sourceId: string, chunks: EmbeddedLegalChunk[]): Promise<void> {
    this.chunksBySource.set(sourceId, chunks);
  }

  async disableSource(sourceId: string): Promise<void> {
    const source = this.sources.get(sourceId);
    if (source) {
      this.sources.set(sourceId, { ...source, status: "repealed" });
    }
  }

  async vectorSearch(queryEmbedding: number[], params: CollectionScopedSearchParams): Promise<VectorSearchHit[]> {
    const candidates = this.scopedChunks(params);
    return candidates
      .map((entry) => ({ chunk: entry.chunk, distance: cosineDistance(queryEmbedding, entry.embedding) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, params.limit);
  }

  async keywordSearch(queryText: string, params: CollectionScopedSearchParams): Promise<KeywordSearchHit[]> {
    const candidates = this.scopedChunks(params);
    return candidates
      .map((entry) => ({ chunk: entry.chunk, matchCount: keywordMatchScore(entry.chunk, queryText) }))
      .filter((hit) => hit.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, params.limit);
  }

  private scopedChunks(params: CollectionScopedSearchParams): EmbeddedLegalChunk[] {
    const all: EmbeddedLegalChunk[] = [];
    for (const entries of this.chunksBySource.values()) {
      all.push(...entries);
    }
    return all.filter((entry) => this.matchesScope(entry, params));
  }

  private matchesScope(entry: EmbeddedLegalChunk, params: CollectionScopedSearchParams): boolean {
    const source = this.sources.get(entry.chunk.sourceId);
    if (!source) return false;
    if (!params.collectionIds.includes(source.collectionId)) return false;
    if (params.activeOnly && source.status !== "active") return false;
    if (!entry.chunk.contractTypes.includes(params.contractType as never)) return false;
    if (params.topics.length > 0 && !params.topics.some((topic) => entry.chunk.topics.includes(topic))) return false;
    return true;
  }
}
