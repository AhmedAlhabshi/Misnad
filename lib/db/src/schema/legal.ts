import { boolean, integer, pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";

/**
 * The Legal RAG knowledge base — curated, public, shared, read-only-at-
 * query-time official source documents and their chunks. Deliberately
 * separate from any future contract/user document table: this is public
 * legal data, versioned and maintained independently, and this phase adds
 * no contract/user document table at all (see the phase report).
 *
 * `GEMINI_EMBEDDING_DIMENSIONS` in `@workspace/legal-rag` is the single
 * source of truth for the embedding model's chosen output size (768) — kept
 * as a literal here (rather than importing across the dependency direction)
 * since `lib/db` has no dependency on `lib/legal-rag`; the two are asserted
 * consistent by `lib/legal-rag`'s own tests.
 */
export const legalSources = pgTable("legal_sources", {
  sourceId: text("source_id").primaryKey(),
  collectionId: text("collection_id").notNull(),
  authority: text("authority").notNull(),
  documentTitleAr: text("document_title_ar").notNull(),
  documentTitleEn: text("document_title_en"),
  documentType: text("document_type").notNull(),
  officialSourceUrl: text("official_source_url").notNull(),
  contractTypes: text("contract_types").array().notNull(),
  topics: text("topics").array().notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  publicationDate: text("publication_date"),
  effectiveDate: text("effective_date"),
  lastVerifiedAt: text("last_verified_at").notNull(),
  status: text("status").notNull(),
  language: text("language").notNull(),
  version: text("version").notNull(),
  ingestionPath: text("ingestion_path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const legalChunks = pgTable("legal_chunks", {
  chunkId: text("chunk_id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => legalSources.sourceId),
  authority: text("authority").notNull(),
  documentTitle: text("document_title").notNull(),
  articleNumber: text("article_number"),
  chapterSection: text("chapter_section"),
  contractTypes: text("contract_types").array().notNull(),
  topics: text("topics").array().notNull(),
  text: text("text").notNull(),
  language: text("language").notNull(),
  status: text("status").notNull(),
  effectiveDate: text("effective_date"),
  officialSourceUrl: text("official_source_url").notNull(),
  chunkOrder: integer("chunk_order").notNull(),
  checksum: text("checksum").notNull(),
  needsManualReview: boolean("needs_manual_review").notNull().default(false),
  /** 768 dimensions — see the comment above; must match GeminiEmbeddingProvider.dimensions exactly. */
  embedding: vector("embedding", { dimensions: 768 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type LegalSourceRow = typeof legalSources.$inferSelect;
export type InsertLegalSourceRow = typeof legalSources.$inferInsert;
export type LegalChunkRow = typeof legalChunks.$inferSelect;
export type InsertLegalChunkRow = typeof legalChunks.$inferInsert;
