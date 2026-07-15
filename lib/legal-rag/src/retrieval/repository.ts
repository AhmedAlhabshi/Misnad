import type { LegalSourceDocument } from "../manifest/schema";
import type { EmbeddedLegalChunk, LegalChunk } from "../chunk/schema";

export interface CollectionScopedSearchParams {
  collectionIds: string[];
  contractType: string;
  /** Empty = no topic filter applied. */
  topics: string[];
  activeOnly: boolean;
  limit: number;
}

export interface VectorSearchHit {
  chunk: LegalChunk;
  /** Cosine distance — lower is more similar (0 = identical direction). */
  distance: number;
}

export interface KeywordSearchHit {
  chunk: LegalChunk;
  /** Number of distinct matched terms/phrases — higher is a stronger keyword match. */
  matchCount: number;
}

/**
 * Storage abstraction the retrieval domain depends on — never a concrete
 * database client. Two implementations exist: `InMemoryLegalChunkRepository`
 * (used by every test and as the DB-blocker fallback) and
 * `PostgresLegalChunkRepository` (the production implementation, backed by
 * `@workspace/db` + pgvector). Both must behave identically from the
 * caller's point of view.
 */
export interface LegalChunkRepository {
  /** Keyed by chunkId — lets ingestion skip re-embedding a chunk whose text checksum hasn't changed. */
  getExistingChunkFingerprints(sourceId: string): Promise<Map<string, { checksum: string; embedding: number[] }>>;
  upsertSource(source: LegalSourceDocument): Promise<void>;
  /** Transactional: replaces exactly this source's chunk set with `chunks` — a source is never left partially ingested. */
  replaceSourceChunks(sourceId: string, chunks: EmbeddedLegalChunk[]): Promise<void>;
  /** Flips the source's stored status to `"repealed"` and excludes its chunks from `activeOnly` retrieval — never a hard delete. */
  disableSource(sourceId: string): Promise<void>;
  vectorSearch(queryEmbedding: number[], params: CollectionScopedSearchParams): Promise<VectorSearchHit[]>;
  keywordSearch(queryText: string, params: CollectionScopedSearchParams): Promise<KeywordSearchHit[]>;
}
