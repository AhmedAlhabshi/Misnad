import type { GroundedContext } from "@workspace/context-builder";
import { buildCitationAllowlist, buildFactKeyAllowlist, sanitizeCitations, sanitizeFactKeys } from "./citationAllowlist";
import { deriveConfidence, deriveEvidenceStatus } from "./evidencePolicy";
import { composedAnswerSchema, type ComposedAnswer, type LlmComposerResponse } from "./schema";

/**
 * The single point where a raw (but already schema-shape-valid)
 * `LlmComposerResponse` becomes the final, trustworthy `ComposedAnswer`.
 * This is where every hallucination-resistance guarantee this package
 * makes is actually enforced: citations and financial fact keys are
 * filtered against allowlists built solely from the supplied
 * `GroundedContext` (never from anything the model said), and
 * `confidence`/`evidenceStatus` are computed independently of the model's
 * output entirely.
 */
export function sanitizeComposerResponse(llmResponse: LlmComposerResponse, context: GroundedContext, providerName: string): ComposedAnswer {
  const citationAllowlist = buildCitationAllowlist(context);
  const factKeyAllowlist = buildFactKeyAllowlist(context);

  const { citations, droppedCount: droppedCitationCount } = sanitizeCitations(llmResponse.citations, citationAllowlist);
  const { factKeys, droppedCount: droppedFactKeyCount } = sanitizeFactKeys(llmResponse.usedFinancialFactKeys, factKeyAllowlist);

  const warnings = [...context.warnings];
  if (droppedCitationCount > 0) {
    warnings.push(`composer_dropped_unverifiable_citations:${droppedCitationCount}`);
  }
  if (droppedFactKeyCount > 0) {
    warnings.push(`composer_dropped_unverifiable_fact_keys:${droppedFactKeyCount}`);
  }

  const evidenceStatus = deriveEvidenceStatus(context);
  const confidence = deriveConfidence(context, evidenceStatus, citations.length, factKeys.length);

  return composedAnswerSchema.parse({
    answer: llmResponse.answer,
    language: context.language === "ar" ? "AR" : "EN",
    route: context.route,
    confidence,
    evidenceStatus,
    citations,
    usedFinancialFactKeys: factKeys,
    warnings,
    provider: providerName,
  });
}
