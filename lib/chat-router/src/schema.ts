import { z } from "zod";
import { isAnalysisLanguage, isContractType, type AnalysisLanguage, type ContractType } from "@workspace/contract-types";

/**
 * Longer than any real chat question we expect; exists only to reject
 * pathological input (e.g. a pasted document) before it reaches pattern
 * matching, not to accommodate genuinely long questions.
 */
export const MAX_QUESTION_LENGTH = 2000;

/**
 * The three trusted, already-implemented retrieval/computation sources this
 * router can point a caller at. This package never queries them itself — it
 * only decides which ones the answer composer must consult.
 */
export const CHAT_SOURCE_KINDS = ["contract", "legal", "financial"] as const;
export type ChatSourceKind = (typeof CHAT_SOURCE_KINDS)[number];

export const CHAT_ROUTES = [
  "contract",
  "legal",
  "financial",
  "contract_and_legal",
  "contract_and_financial",
  "all",
  "general",
] as const;
export type ChatRoute = (typeof CHAT_ROUTES)[number];

/**
 * Only what the router needs to make a decision. Deliberately excludes the
 * contract text itself, any session identifier, and any other user's data —
 * the router reasons about the *question*, never about document content.
 */
export const chatRouterInputSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "question must not be empty")
    .max(MAX_QUESTION_LENGTH, `question must not exceed ${MAX_QUESTION_LENGTH} characters`),
  contractType: z.custom<ContractType>((value) => isContractType(value), {
    message: "contractType must be a recognized ContractType",
  }),
  answerLanguage: z.custom<AnalysisLanguage>((value) => isAnalysisLanguage(value), {
    message: "answerLanguage must be 'ar' or 'en'",
  }),
  contractRagAvailable: z.boolean(),
  legalRagAvailable: z.boolean(),
  financialMetricsAvailable: z.boolean(),
});
export type ChatRouterInput = z.infer<typeof chatRouterInputSchema>;

export const requiredSourceStatusSchema = z.object({
  source: z.enum(CHAT_SOURCE_KINDS),
  /** Whether this specific source is currently available for THIS request — independent of whether the route requires it. */
  available: z.boolean(),
});
export type RequiredSourceStatus = z.infer<typeof requiredSourceStatusSchema>;

export const chatRouteDecisionSchema = z.object({
  route: z.enum(CHAT_ROUTES),
  /** Every source the chosen route requires, each tagged with its current availability. Never silently omits an unavailable source. */
  requiredSources: z.array(requiredSourceStatusSchema),
  /** Convenience projection of `requiredSources` — the subset that is required but currently unavailable. Empty when everything the route needs is available. */
  unavailableRequiredSources: z.array(z.enum(CHAT_SOURCE_KINDS)),
  confidence: z.number().min(0).max(1),
  /** Named, human-readable codes explaining why this route/confidence was chosen (see reasons.ts-style constants in signals/detectIntentSignals.ts and routing/selectRoute.ts). Always non-empty. */
  reasons: z.array(z.string()).min(1),
  normalizedQuestion: z.string(),
  /**
   * Always `true` in this milestone. Reserved so a future optional LLM
   * classification fallback (not implemented here) can mark its own
   * decisions `false` without changing this schema's shape.
   */
  deterministic: z.boolean(),
});
export type ChatRouteDecision = z.infer<typeof chatRouteDecisionSchema>;
