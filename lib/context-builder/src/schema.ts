import { z } from "zod";
import { CHAT_ROUTES, CHAT_SOURCE_KINDS } from "@workspace/chat-router";
import { isAnalysisLanguage, isContractType, type AnalysisLanguage, type ContractType } from "@workspace/contract-types";

/**
 * Every evidence item — regardless of which source produced it — carries
 * these four fields so a caller can always answer "where did this come
 * from and how sure should I be": `authority` (who/what produced it),
 * `citation` (a pointer back to it — a real URL for legal evidence, an
 * internal field path for a computed financial/analysis fact, a section
 * reference for the user's own contract), `relevanceScore` (0-1, see
 * `ranking.ts`), and `excerpt` (the actual text — for contract/legal
 * evidence this is copied verbatim from the retrieval result and is NEVER
 * edited, reworded, or truncated further by this package).
 */
const baseEvidenceFields = {
  authority: z.string().min(1),
  citation: z.string().min(1),
  relevanceScore: z.number().min(0).max(1),
  excerpt: z.string(),
};

export const contractEvidenceItemSchema = z.object({
  source: z.literal("contract"),
  ...baseEvidenceFields,
  chunkId: z.string(),
  section: z.string().nullable(),
  chunkOrder: z.number(),
});
export type ContractEvidenceItem = z.infer<typeof contractEvidenceItemSchema>;

export const legalEvidenceItemSchema = z.object({
  source: z.literal("legal"),
  ...baseEvidenceFields,
  chunkId: z.string(),
  documentTitle: z.string(),
  articleNumber: z.string().nullable(),
  section: z.string().nullable(),
});
export type LegalEvidenceItem = z.infer<typeof legalEvidenceItemSchema>;

export const financialFactItemSchema = z.object({
  source: z.literal("financial"),
  ...baseEvidenceFields,
  /** Stable identifier for dedup/ranking, e.g. "monthly_payment" or "fee:<feeItemId>" — see financialCollector.ts. */
  factKey: z.string().min(1),
  label: z.string().min(1),
});
export type FinancialFactItem = z.infer<typeof financialFactItemSchema>;

export const analysisFactItemSchema = z.object({
  source: z.literal("analysis"),
  ...baseEvidenceFields,
  factKey: z.string().min(1),
  label: z.string().min(1),
});
export type AnalysisFactItem = z.infer<typeof analysisFactItemSchema>;

export const evidenceItemSchema = z.discriminatedUnion("source", [
  contractEvidenceItemSchema,
  legalEvidenceItemSchema,
  financialFactItemSchema,
  analysisFactItemSchema,
]);
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

/**
 * The single structured object this package produces. Contains only
 * evidence gathered from the sources the Chat Router's decision actually
 * requires (see `contextBuilder.ts`) — never generated prose, never an
 * answer. `warnings` is always present (possibly empty) so a caller never
 * has to guess whether something was silently skipped.
 */
export const groundedContextSchema = z.object({
  route: z.enum(CHAT_ROUTES),
  question: z.string(),
  language: z.custom<AnalysisLanguage>((value) => isAnalysisLanguage(value), { message: "language must be 'ar' or 'en'" }),
  contractType: z.custom<ContractType>((value) => isContractType(value), { message: "contractType must be a recognized ContractType" }),
  /** The subset of {"contract","legal","financial"} that was both required by the route AND available — see contextBuilder.ts's doc-comment for why this mirrors the router's own decision rather than "did retrieval find something". */
  sourcesUsed: z.array(z.enum(CHAT_SOURCE_KINDS)),
  contractEvidence: z.array(contractEvidenceItemSchema),
  legalEvidence: z.array(legalEvidenceItemSchema),
  financialFacts: z.array(financialFactItemSchema),
  analysisFacts: z.array(analysisFactItemSchema),
  tokenEstimate: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});
export type GroundedContext = z.infer<typeof groundedContextSchema>;
