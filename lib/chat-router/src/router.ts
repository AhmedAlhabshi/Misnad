import { normalizeQuestion } from "./normalize/normalizeQuestion";
import { detectIntentSignals } from "./signals/detectIntentSignals";
import { selectRoute } from "./routing/selectRoute";
import { evaluateAvailability } from "./routing/evaluateAvailability";
import { chatRouteDecisionSchema, chatRouterInputSchema, type ChatRouteDecision, type ChatRouterInput } from "./schema";

/**
 * Given a user question and the current analyzed-contract context, decide
 * which trusted sources (Contract RAG, Legal RAG, financial metrics) must
 * be queried before an answer is composed. This function never queries any
 * of those sources itself, and is never given the contract text — only the
 * question and three availability booleans (see `ChatRouterInput`).
 *
 * Pipeline: normalize -> detect intent signals -> select route
 * (deterministic, rule-based) -> evaluate source availability for that
 * route -> validate the assembled decision against `chatRouteDecisionSchema`.
 *
 * Extension point (not implemented here): when `confidence` is below
 * `routing/selectRoute.ts`'s `LOW_CONFIDENCE_THRESHOLD`, a future milestone
 * can run an optional LLM classifier over the same `normalizedQuestion` and
 * override/merge this decision — every stage above is a small pure
 * function specifically so that fallback can be inserted without
 * restructuring anything. It isn't added now because no currently-live
 * caller requires it.
 *
 * Throws a `ZodError` if `input` or the assembled decision fails
 * validation (e.g. an empty or excessively long question) — this function
 * never silently coerces invalid input.
 */
export function routeChatQuestion(rawInput: ChatRouterInput): ChatRouteDecision {
  const input = chatRouterInputSchema.parse(rawInput);

  const normalizedQuestion = normalizeQuestion(input.question);
  const signals = detectIntentSignals(normalizedQuestion);
  const { route, confidence, reasons } = selectRoute(signals);
  const availability = evaluateAvailability(route, {
    contractRagAvailable: input.contractRagAvailable,
    legalRagAvailable: input.legalRagAvailable,
    financialMetricsAvailable: input.financialMetricsAvailable,
  });

  const decision: ChatRouteDecision = {
    route,
    requiredSources: availability.requiredSources,
    unavailableRequiredSources: availability.unavailableRequiredSources,
    confidence,
    reasons: [...reasons, ...availability.reasons],
    normalizedQuestion,
    deterministic: true,
  };

  return chatRouteDecisionSchema.parse(decision);
}
