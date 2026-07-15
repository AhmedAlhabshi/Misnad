import type { ContractType } from "@workspace/contract-types";
import { z } from "zod";
import { legalLanguageSchema, legalSourceStatusSchema } from "../manifest/schema";

/**
 * One legal-semantic chunk — an article, a section, or (only as a flagged
 * fallback) a paragraph. Every field needed to cite the chunk travels with
 * the text itself; nothing here is ever separated from its source.
 */
export const legalChunkSchema = z.object({
  chunkId: z.string().min(1),
  sourceId: z.string().min(1),
  authority: z.string().min(1),
  documentTitle: z.string().min(1),
  /** e.g. "Article 9" / "المادة 9" — null only for the paragraph-fallback case. */
  articleNumber: z.string().min(1).nullable(),
  chapterSection: z.string().min(1).nullable(),
  contractTypes: z.array(z.custom<ContractType>((v) => typeof v === "string")),
  topics: z.array(z.string()),
  text: z.string().min(1).max(4000),
  language: legalLanguageSchema,
  status: legalSourceStatusSchema,
  effectiveDate: z.string().nullable(),
  officialSourceUrl: z.string().url(),
  chunkOrder: z.number().int().min(0),
  checksum: z.string().min(1),
  /** True only when no reliable article/section structure was found and this chunk came from the paragraph-level fallback — surfaced so a human can review it before it's trusted in production. */
  needsManualReview: z.boolean(),
});

export type LegalChunk = z.infer<typeof legalChunkSchema>;

/** A chunk plus its embedding vector — kept separate from `LegalChunk` since embedding only happens after chunking succeeds. */
export interface EmbeddedLegalChunk {
  chunk: LegalChunk;
  embedding: number[];
}
