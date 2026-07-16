import type { IntentSignals } from "../signals/detectIntentSignals";
import type { ChatRoute } from "../schema";

/** Confidence tiers — deliberately coarse and named rather than a tuned ML-style score, since this stage is 100% rule-based. */
export const BASE_CONFIDENCE = 0.5;
export const SIGNAL_CONFIDENCE_INCREMENT = 0.15;
export const MAX_DETERMINISTIC_CONFIDENCE = 0.95;
/** No deterministic category matched at all — the lowest-trust, purely-default outcome. */
export const NO_SIGNAL_CONFIDENCE = 0.4;
/** Fixed, maximal confidence for the safety short-circuit — this is a policy decision, not a pattern-strength measurement. */
export const INJECTION_OVERRIDE_CONFIDENCE = 0.95;

/**
 * A future optional LLM classification fallback (not implemented in this
 * milestone) would be invoked when confidence falls below this threshold.
 * Exported so that future caller can make the decision without this
 * package needing to know about it.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.55;

export interface RouteSelection {
  route: ChatRoute;
  confidence: number;
  reasons: string[];
}

/**
 * Pure function: raw intent signals in, a route + confidence + human
 * -readable reason codes out. Contains the entire routing policy in one
 * place — see the project's final report for the worked examples this
 * priority order was designed against.
 *
 * Priority (first match wins):
 *  1. Injection/safety override -> general (see patterns.ts).
 *  2. Comparison signal AND financial signal -> all (contract + legal + financial evidence all genuinely needed).
 *  3. Comparison signal alone -> contract_and_legal.
 *  4. Contract signal AND financial signal (no comparison) -> contract_and_financial.
 *  5. Contract signal alone -> contract.
 *  6. Financial signal alone -> financial.
 *  7. Legal term alone (no contract/comparison signal) -> legal.
 *  8. Otherwise -> general (covers pure definitional questions like "ما معنى الشرط الجزائي؟"
 *     and generic conversational questions like "What is RAG?" — both are
 *     "basic conversational or explanatory questions that do not require
 *     retrieval" per the general route's own definition, a deliberate
 *     policy choice documented in the final report).
 */
export function selectRoute(signals: IntentSignals): RouteSelection {
  if (signals.hasInjectionAttempt) {
    return {
      route: "general",
      confidence: INJECTION_OVERRIDE_CONFIDENCE,
      reasons: ["injection_pattern_detected: routed to general, no source query performed"],
    };
  }

  const matchedCategoryCount = [signals.contractSignal, signals.financialSignal, signals.hasLegalTerm, signals.comparisonSignal].filter(
    Boolean,
  ).length;
  const confidence = Math.min(MAX_DETERMINISTIC_CONFIDENCE, BASE_CONFIDENCE + SIGNAL_CONFIDENCE_INCREMENT * matchedCategoryCount);

  const reasons: string[] = [];
  if (signals.hasContractOwnership) reasons.push("contract_ownership_phrase_matched");
  if (signals.hasContractStructure) reasons.push("contract_structure_phrase_matched");
  if (signals.hasFinancialTerm) reasons.push("financial_term_phrase_matched");
  if (signals.hasFinancialComputeTrigger) reasons.push("financial_compute_trigger_present");
  if (signals.hasLegalTerm) reasons.push("legal_term_phrase_matched");
  if (signals.hasComparisonExplicit) reasons.push("explicit_compare_to_law_phrase_matched");
  if (signals.hasRightsPhrase && signals.hasComparisonActor && signals.hasComparisonAction) {
    reasons.push("rights_actor_action_combination_matched");
  }
  if (signals.hasLegalTerm && signals.contractSignal && !signals.hasComparisonExplicit) {
    reasons.push("legal_term_co-occurs_with_contract_reference");
  }

  if (signals.comparisonSignal && signals.financialSignal) {
    return { route: "all", confidence, reasons };
  }
  if (signals.comparisonSignal) {
    return { route: "contract_and_legal", confidence, reasons };
  }
  if (signals.contractSignal && signals.financialSignal) {
    return { route: "contract_and_financial", confidence, reasons };
  }
  if (signals.contractSignal) {
    return { route: "contract", confidence, reasons };
  }
  if (signals.financialSignal) {
    return { route: "financial", confidence, reasons };
  }
  if (signals.hasLegalTerm) {
    return { route: "legal", confidence, reasons };
  }

  if (signals.hasDefinitionalPhrase) {
    reasons.push("definitional_question_no_specific_reference");
  } else {
    reasons.push("no_specific_signals_detected");
  }
  return { route: "general", confidence: NO_SIGNAL_CONFIDENCE, reasons };
}
