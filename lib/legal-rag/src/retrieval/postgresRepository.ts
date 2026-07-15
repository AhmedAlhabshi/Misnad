import type { ContractType } from "@workspace/contract-types";
import { db } from "@workspace/db";
import { legalChunks, legalSources } from "@workspace/db/schema";
import { and, cosineDistance, eq, inArray, sql } from "drizzle-orm";
import type { EmbeddedLegalChunk, LegalChunk } from "../chunk/schema";
import { keywordMatchScore } from "./keywordMatch";
import type { LegalLanguage, LegalSourceStatus } from "../manifest/schema";
import type { LegalSourceDocument } from "../manifest/schema";
import type { CollectionScopedSearchParams, KeywordSearchHit, LegalChunkRepository, VectorSearchHit } from "./repository";

function rowToChunk(row: typeof legalChunks.$inferSelect): LegalChunk {
  return {
    chunkId: row.chunkId,
    sourceId: row.sourceId,
    authority: row.authority,
    documentTitle: row.documentTitle,
    articleNumber: row.articleNumber,
    chapterSection: row.chapterSection,
    contractTypes: row.contractTypes as ContractType[],
    topics: row.topics,
    text: row.text,
    language: row.language as LegalLanguage,
    status: row.status as LegalSourceStatus,
    effectiveDate: row.effectiveDate,
    officialSourceUrl: row.officialSourceUrl,
    chunkOrder: row.chunkOrder,
    checksum: row.checksum,
    needsManualReview: row.needsManualReview,
  };
}

function sourceValues(source: LegalSourceDocument) {
  return {
    sourceId: source.sourceId,
    collectionId: source.collectionId,
    authority: source.authority,
    documentTitleAr: source.documentTitleAr,
    documentTitleEn: source.documentTitleEn,
    documentType: source.documentType,
    officialSourceUrl: source.officialSourceUrl,
    contractTypes: source.contractTypes,
    topics: source.topics,
    jurisdiction: source.jurisdiction,
    publicationDate: source.publicationDate,
    effectiveDate: source.effectiveDate,
    lastVerifiedAt: source.lastVerifiedAt,
    status: source.status,
    language: source.language,
    version: source.version,
    ingestionPath: source.ingestionPath,
  };
}

function scopeFilter(params: CollectionScopedSearchParams) {
  const clauses = [
    inArray(legalSources.collectionId, params.collectionIds),
    sql`${params.contractType} = ANY(${legalChunks.contractTypes})`,
  ];
  if (params.activeOnly) {
    clauses.push(eq(legalSources.status, "active"));
  }
  if (params.topics.length > 0) {
    // A plain JS array interpolated into a `sql` template is expanded as
    // separate comma-joined parameters, not bound as a single Postgres array
    // value — so it must be built explicitly as an `ARRAY[...]` constructor
    // from individually-bound scalar parameters instead.
    const topicsArray = sql`ARRAY[${sql.join(
      params.topics.map((topic) => sql`${topic}`),
      sql`, `,
    )}]::text[]`;
    clauses.push(sql`${legalChunks.topics} && ${topicsArray}`);
  }
  return and(...clauses);
}

/**
 * Production `LegalChunkRepository` implementation, backed by
 * `@workspace/db` + pgvector. NOT exercised against a live database in this
 * phase (`DATABASE_URL` was not available in this environment) — see the
 * phase report for the exact provisioning steps required before this path
 * can be used, and `InMemoryLegalChunkRepository` for the implementation
 * every test actually runs against.
 */
export class PostgresLegalChunkRepository implements LegalChunkRepository {
  async getExistingChunkFingerprints(sourceId: string): Promise<Map<string, { checksum: string; embedding: number[] }>> {
    const rows = await db
      .select({ chunkId: legalChunks.chunkId, checksum: legalChunks.checksum, embedding: legalChunks.embedding })
      .from(legalChunks)
      .where(eq(legalChunks.sourceId, sourceId));

    const map = new Map<string, { checksum: string; embedding: number[] }>();
    for (const row of rows) {
      if (row.embedding) {
        map.set(row.chunkId, { checksum: row.checksum, embedding: row.embedding as unknown as number[] });
      }
    }
    return map;
  }

  async upsertSource(source: LegalSourceDocument): Promise<void> {
    const values = sourceValues(source);
    await db
      .insert(legalSources)
      .values({ ...values, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: legalSources.sourceId,
        set: { ...values, updatedAt: new Date() },
      });
  }

  async replaceSourceChunks(sourceId: string, chunks: EmbeddedLegalChunk[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(legalChunks).where(eq(legalChunks.sourceId, sourceId));
      if (chunks.length === 0) return;
      await tx.insert(legalChunks).values(
        chunks.map(({ chunk, embedding }) => ({
          chunkId: chunk.chunkId,
          sourceId: chunk.sourceId,
          authority: chunk.authority,
          documentTitle: chunk.documentTitle,
          articleNumber: chunk.articleNumber,
          chapterSection: chunk.chapterSection,
          contractTypes: chunk.contractTypes,
          topics: chunk.topics,
          text: chunk.text,
          language: chunk.language,
          status: chunk.status,
          effectiveDate: chunk.effectiveDate,
          officialSourceUrl: chunk.officialSourceUrl,
          chunkOrder: chunk.chunkOrder,
          checksum: chunk.checksum,
          needsManualReview: chunk.needsManualReview,
          embedding,
          updatedAt: new Date(),
        })),
      );
    });
  }

  async disableSource(sourceId: string): Promise<void> {
    await db.update(legalSources).set({ status: "repealed", updatedAt: new Date() }).where(eq(legalSources.sourceId, sourceId));
  }

  async vectorSearch(queryEmbedding: number[], params: CollectionScopedSearchParams): Promise<VectorSearchHit[]> {
    const distanceExpr = cosineDistance(legalChunks.embedding, queryEmbedding);
    const rows = await db
      .select({ chunk: legalChunks, distance: distanceExpr })
      .from(legalChunks)
      .innerJoin(legalSources, eq(legalChunks.sourceId, legalSources.sourceId))
      .where(scopeFilter(params))
      .orderBy(distanceExpr)
      .limit(params.limit);

    return rows.map((row) => ({ chunk: rowToChunk(row.chunk), distance: Number(row.distance) }));
  }

  async keywordSearch(queryText: string, params: CollectionScopedSearchParams): Promise<KeywordSearchHit[]> {
    // Postgres full-text search is used only to prefilter to candidate rows
    // efficiently; the actual match score is computed by the exact same
    // `keywordMatchScore` function the in-memory repository uses, so both
    // repositories rank identically regardless of storage backend.
    const rows = await db
      .select({ chunk: legalChunks })
      .from(legalChunks)
      .innerJoin(legalSources, eq(legalChunks.sourceId, legalSources.sourceId))
      .where(and(scopeFilter(params), sql`to_tsvector('simple', ${legalChunks.text}) @@ websearch_to_tsquery('simple', ${queryText})`))
      .limit(params.limit * 2);

    return rows
      .map((row) => {
        const chunk = rowToChunk(row.chunk);
        return { chunk, matchCount: keywordMatchScore(chunk, queryText) };
      })
      .filter((hit) => hit.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, params.limit);
  }
}
