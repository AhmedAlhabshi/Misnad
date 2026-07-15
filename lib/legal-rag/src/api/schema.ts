import { CONTRACT_TYPE_VALUES, type ContractType } from "@workspace/contract-types";
import { z } from "zod";
import { MAX_TOP_K } from "../retrieval/service";

const MAX_QUERY_CHARS = 500;
const MAX_TOPICS = 5;
const MAX_TOPIC_CHARS = 60;

/**
 * Request schema for `POST /api/legal-search`. Reuses the existing
 * `ContractType` enum (`@workspace/contract-types`) rather than duplicating
 * the list of contract-type strings — the same pattern every other route in
 * this repository already follows for `contractType`.
 */
export const legalSearchRequestSchema = z.object({
  query: z.string().min(1).max(MAX_QUERY_CHARS),
  contractType: z.enum(CONTRACT_TYPE_VALUES as [ContractType, ...ContractType[]]),
  language: z.enum(["AR", "EN"]).optional(),
  topics: z.array(z.string().min(1).max(MAX_TOPIC_CHARS)).max(MAX_TOPICS).optional(),
  topK: z.number().int().min(1).max(MAX_TOP_K).optional(),
});

export type LegalSearchRequest = z.infer<typeof legalSearchRequestSchema>;

const legalSearchResultItemSchema = z.object({
  chunkId: z.string(),
  authority: z.string(),
  documentTitle: z.string(),
  articleNumber: z.string().nullable(),
  section: z.string().nullable(),
  excerpt: z.string(),
  officialSourceUrl: z.string().url(),
  topics: z.array(z.string()),
  score: z.number(),
});

export const legalSearchResponseSchema = z.object({
  success: z.literal(true),
  status: z.enum(["results_found", "insufficient_source"]),
  results: z.array(legalSearchResultItemSchema),
});

export type LegalSearchHttpResponse = z.infer<typeof legalSearchResponseSchema>;
