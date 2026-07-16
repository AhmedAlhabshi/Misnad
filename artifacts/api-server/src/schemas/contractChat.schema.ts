import { z } from "zod/v4";
import { CONTRACT_TYPE_VALUES, type ContractType } from "@workspace/contract-types";
import { isValidContractRagSessionIdFormat } from "@workspace/contract-rag";
import { MAX_QUESTION_LENGTH, CHAT_ROUTES, CHAT_SOURCE_KINDS } from "@workspace/chat-router";
import { financialMetricsSchema } from "@workspace/financial-metrics";
import { contractUnderstandingSchema } from "@workspace/contract-schema";
import { composedAnswerSchema } from "@workspace/answer-composer";

/**
 * Request schema for `POST /api/contract-chat`. Deliberately `.strict()` —
 * any field not listed here (in particular a raw/masked contract text
 * field of any name) is rejected outright as a 400, never silently
 * dropped or accepted. `question` reuses chat-router's own
 * `MAX_QUESTION_LENGTH` rather than a second, possibly-drifting constant.
 *
 * `financialMetrics`/`contractAnalysis` are accepted from the client and
 * validated against the exact same schemas the analyze-contract flow
 * itself produces them with (`@workspace/financial-metrics`,
 * `@workspace/contract-schema`) — see this route's own file-level
 * doc-comment in `contractChat.ts` for why: this codebase has no
 * server-side, session-scoped store for either object today (only
 * Contract RAG sessions are persisted server-side), so re-validating
 * whatever the client re-sends is the only available option, not a
 * deliberate trust decision.
 */
export const contractChatRequestSchema = z
  .object({
    question: z.string().trim().min(1, "question must not be empty").max(MAX_QUESTION_LENGTH, `question must not exceed ${MAX_QUESTION_LENGTH} characters`),
    contractRagSessionId: z.string().refine(isValidContractRagSessionIdFormat, "Invalid session id format").optional(),
    selectedContractType: z.enum(CONTRACT_TYPE_VALUES as [ContractType, ...ContractType[]]),
    answerLanguage: z.enum(["AR", "EN"]),
    financialMetrics: financialMetricsSchema.optional(),
    contractAnalysis: contractUnderstandingSchema.optional(),
  })
  .strict();

export type ContractChatRequest = z.infer<typeof contractChatRequestSchema>;

export const contractChatErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "INVALID_SESSION",
  "SESSION_EXPIRED",
  "CONTRACT_CONTEXT_UNAVAILABLE",
  "LEGAL_RETRIEVAL_UNAVAILABLE",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "ANSWER_GENERATION_FAILED",
  "REQUEST_TIMEOUT",
  "INTERNAL_ERROR",
]);
export type ContractChatErrorCode = z.infer<typeof contractChatErrorCodeSchema>;

export const contractChatSuccessResponseSchema = z.object({
  success: z.literal(true),
  answer: composedAnswerSchema,
  route: z.enum(CHAT_ROUTES),
  unavailableSources: z.array(z.enum(CHAT_SOURCE_KINDS)),
  warnings: z.array(z.string()),
});
export type ContractChatSuccessResponse = z.infer<typeof contractChatSuccessResponseSchema>;

export const contractChatErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: contractChatErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
  }),
});
export type ContractChatErrorResponse = z.infer<typeof contractChatErrorResponseSchema>;

export const contractChatResponseSchema = z.union([contractChatSuccessResponseSchema, contractChatErrorResponseSchema]);
export type ContractChatResponse = z.infer<typeof contractChatResponseSchema>;
