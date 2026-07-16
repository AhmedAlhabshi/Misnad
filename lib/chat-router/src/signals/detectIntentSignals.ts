import {
  COMPARISON_ACTION_STEM_PHRASES,
  COMPARISON_ACTOR_PHRASES,
  COMPARISON_EXPLICIT_PHRASES,
  CONTRACT_OWNERSHIP_PHRASES,
  CONTRACT_STRUCTURE_PHRASES,
  DEFINITIONAL_PHRASES,
  FINANCIAL_COMPUTE_TRIGGER_PHRASES,
  FINANCIAL_TERM_PHRASES,
  INJECTION_PHRASES,
  LEGAL_TERM_PHRASES,
  RIGHTS_QUESTION_PHRASES,
  includesAny,
} from "./patterns";

/**
 * Raw per-category evidence found in the normalized question. This is the
 * only thing `routing/selectRoute.ts` looks at — it never re-reads the
 * question text itself, keeping "what counts as evidence" (this file) and
 * "what a given combination of evidence means" (selectRoute.ts) separate.
 */
export interface IntentSignals {
  hasContractOwnership: boolean;
  hasContractStructure: boolean;
  /** `hasContractOwnership || hasContractStructure` — the question refers to the uploaded contract at all. */
  contractSignal: boolean;
  hasFinancialTerm: boolean;
  hasFinancialComputeTrigger: boolean;
  /** `hasFinancialTerm` only — a bare compute trigger ("how much", "كم") never sets this alone. */
  financialSignal: boolean;
  hasLegalTerm: boolean;
  hasRightsPhrase: boolean;
  hasComparisonActor: boolean;
  hasComparisonAction: boolean;
  hasComparisonExplicit: boolean;
  /**
   * True when the question is asking Saudi law/regulations to be compared
   * against the contract — either through an explicit "compare this to the
   * law" phrasing, a full actor+action+rights-phrase combination (e.g. "is
   * the landlord allowed to evict me"), or a legal term co-occurring with a
   * contract reference (e.g. "is this penalty allowed under Saudi
   * regulations"). See `signals/patterns.ts`'s module doc-comment for why
   * no single generic word can trigger this alone.
   */
  comparisonSignal: boolean;
  hasDefinitionalPhrase: boolean;
  /** Instruction-override / cross-session-exfiltration phrasing detected — see `patterns.ts`'s `INJECTION_PHRASES` doc-comment. */
  hasInjectionAttempt: boolean;
}

export function detectIntentSignals(normalizedQuestion: string): IntentSignals {
  const hasContractOwnership = includesAny(normalizedQuestion, CONTRACT_OWNERSHIP_PHRASES);
  const hasContractStructure = includesAny(normalizedQuestion, CONTRACT_STRUCTURE_PHRASES);
  const contractSignal = hasContractOwnership || hasContractStructure;

  const hasFinancialTerm = includesAny(normalizedQuestion, FINANCIAL_TERM_PHRASES);
  const hasFinancialComputeTrigger = includesAny(normalizedQuestion, FINANCIAL_COMPUTE_TRIGGER_PHRASES);
  const financialSignal = hasFinancialTerm;

  const hasLegalTerm = includesAny(normalizedQuestion, LEGAL_TERM_PHRASES);
  const hasRightsPhrase = includesAny(normalizedQuestion, RIGHTS_QUESTION_PHRASES);
  const hasComparisonActor = includesAny(normalizedQuestion, COMPARISON_ACTOR_PHRASES);
  const hasComparisonAction = includesAny(normalizedQuestion, COMPARISON_ACTION_STEM_PHRASES);
  const hasComparisonExplicit = includesAny(normalizedQuestion, COMPARISON_EXPLICIT_PHRASES);

  const comparisonSignal =
    hasComparisonExplicit ||
    (hasRightsPhrase && hasComparisonActor && hasComparisonAction) ||
    (hasLegalTerm && contractSignal);

  const hasDefinitionalPhrase = includesAny(normalizedQuestion, DEFINITIONAL_PHRASES);
  const hasInjectionAttempt = includesAny(normalizedQuestion, INJECTION_PHRASES);

  return {
    hasContractOwnership,
    hasContractStructure,
    contractSignal,
    hasFinancialTerm,
    hasFinancialComputeTrigger,
    financialSignal,
    hasLegalTerm,
    hasRightsPhrase,
    hasComparisonActor,
    hasComparisonAction,
    hasComparisonExplicit,
    comparisonSignal,
    hasDefinitionalPhrase,
    hasInjectionAttempt,
  };
}
