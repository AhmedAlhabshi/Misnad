import { boolean, integer, pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";

/**
 * Contract RAG — private, temporary, session-isolated data belonging to
 * exactly one uploaded contract's masked text. Structurally separate from
 * `legal.ts` (Legal RAG's durable, public, shared knowledge base): a
 * different pair of tables, a different lifecycle (every row here carries
 * its own `expires_at` and is expected to be deleted, never kept forever),
 * and a different write path (only the analyze-contract flow and the
 * cleanup job ever write here — never the legal ingestion CLI, and never
 * writes here bleed into `legal_sources`/`legal_chunks` or vice versa).
 *
 * `embedding` uses the same 768-dimensional Gemini embedding configuration
 * already established by Legal RAG (`GEMINI_EMBEDDING_DIMENSIONS` in
 * `@workspace/legal-rag`) — kept as a literal here for the same reason
 * `legal.ts` does: `lib/db` has no dependency on either RAG package.
 */
export const contractRagSessions = pgTable("contract_rag_sessions", {
  /** Opaque, cryptographically random capability token (see `@workspace/contract-rag`'s `generateContractRagSessionId`) — never a sequential id. */
  sessionId: text("session_id").primaryKey(),
  contractType: text("contract_type").notNull(),
  analysisLanguage: text("analysis_language").notNull(),
  status: text("status").notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  /** Optional checksum of the masked source text — never the raw/masked text itself. */
  sourceFingerprint: text("source_fingerprint"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const contractRagChunks = pgTable("contract_rag_chunks", {
  chunkId: text("chunk_id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => contractRagSessions.sessionId, { onDelete: "cascade" }),
  chunkOrder: integer("chunk_order").notNull(),
  section: text("section"),
  /** Masked text only — enforced by the indexing orchestrator before any row is ever written here, never by this schema alone. */
  text: text("text").notNull(),
  topics: text("topics").array().notNull(),
  checksum: text("checksum").notNull(),
  needsManualReview: boolean("needs_manual_review").notNull().default(false),
  /** 768 dimensions — must match GeminiEmbeddingProvider.dimensions exactly (same model as Legal RAG). */
  embedding: vector("embedding", { dimensions: 768 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type ContractRagSessionRow = typeof contractRagSessions.$inferSelect;
export type InsertContractRagSessionRow = typeof contractRagSessions.$inferInsert;
export type ContractRagChunkRow = typeof contractRagChunks.$inferSelect;
export type InsertContractRagChunkRow = typeof contractRagChunks.$inferInsert;
