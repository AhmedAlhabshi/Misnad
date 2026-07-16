import { z } from "zod";
import { isValidContractRagSessionIdFormat } from "../session/sessionId";

/**
 * Generous static ceilings only — the actual enforced bounds are the
 * configurable ones read fresh from `getContractRagConfig()` inside
 * `retrieveContractContext` (`maxQueryChars`/`maxTopK`). These schema-level
 * numbers exist purely to reject a wildly oversized payload before it ever
 * reaches retrieval, not to duplicate the real, configurable limit.
 */
const MAX_QUERY_CHARS_SCHEMA_BOUND = 2000;
const MAX_TOP_K_SCHEMA_BOUND = 50;
const MAX_CLAUSE_TITLE_CHARS = 200;

/**
 * Request schema for `POST /api/contract-search`. `sessionId` format is
 * validated here (never a raw/sequential id, never a SQL-shaped string) —
 * an invalid format never reaches the retrieval service or a database
 * query at all.
 */
export const contractSearchRequestSchema = z.object({
  sessionId: z.string().refine(isValidContractRagSessionIdFormat, "Invalid session id format"),
  query: z.string().min(1).max(MAX_QUERY_CHARS_SCHEMA_BOUND),
  language: z.enum(["ar", "en"]),
  topK: z.number().int().min(1).max(MAX_TOP_K_SCHEMA_BOUND).optional(),
  selectedClauseTitle: z.string().min(1).max(MAX_CLAUSE_TITLE_CHARS).optional(),
});

export type ContractSearchRequest = z.infer<typeof contractSearchRequestSchema>;

const contractSearchResultItemSchema = z.object({
  chunkId: z.string(),
  section: z.string().nullable(),
  excerpt: z.string(),
  chunkOrder: z.number(),
  score: z.number(),
});

/**
 * Public HTTP status values. `contract_session_unavailable` deliberately
 * collapses "expired", "never existed", and "belongs to someone else" into
 * one indistinguishable outcome — the internal `session_unavailable` status
 * from `retrieveContractContext` is mapped to this at the route layer.
 */
export const contractSearchResponseSchema = z.object({
  success: z.literal(true),
  status: z.enum(["results_found", "insufficient_contract_context", "contract_session_unavailable"]),
  results: z.array(contractSearchResultItemSchema),
});

export type ContractSearchHttpResponse = z.infer<typeof contractSearchResponseSchema>;
