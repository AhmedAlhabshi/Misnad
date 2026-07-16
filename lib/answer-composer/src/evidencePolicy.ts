import type { ChatRoute } from "@workspace/chat-router";
import type { GroundedContext } from "@workspace/context-builder";
import type { ComposerConfidence, ComposerEvidenceStatus } from "./schema";

type EvidenceCategory = "contractEvidence" | "legalEvidence" | "financialFacts";

/**
 * Which `GroundedContext` arrays a route's answer is expected to draw on —
 * mirrors `@workspace/chat-router`'s own `ROUTE_REQUIRED_SOURCES` mapping
 * (contract→contract, legal→legal, financial→financial, and so on), kept
 * as a small local table rather than importing that map directly because
 * the categories here are `GroundedContext` array names, not
 * `ChatSourceKind` values — a deliberate one-line translation layer, not a
 * duplicate of the router's routing policy itself.
 */
const ROUTE_EVIDENCE_CATEGORIES: Record<ChatRoute, readonly EvidenceCategory[]> = {
  general: [],
  contract: ["contractEvidence"],
  legal: ["legalEvidence"],
  financial: ["financialFacts"],
  contract_and_legal: ["contractEvidence", "legalEvidence"],
  contract_and_financial: ["contractEvidence", "financialFacts"],
  all: ["contractEvidence", "legalEvidence", "financialFacts"],
};

/**
 * Server-derived, never taken from the model (see `schema.ts`'s doc-comment
 * on `composedAnswerSchema`). Purely a function of what the route requires
 * and what evidence the context actually contains:
 *  - "general" requires nothing, so it is always "sufficient" — a general
 *    question was never supposed to be evidence-backed in the first place.
 *  - Every required category present (non-empty) → "sufficient".
 *  - Every required category empty → "insufficient".
 *  - A mix of present/empty required categories → "partial".
 */
export function deriveEvidenceStatus(context: GroundedContext): ComposerEvidenceStatus {
  const required = ROUTE_EVIDENCE_CATEGORIES[context.route];
  if (required.length === 0) {
    return "sufficient";
  }

  const presentCount = required.filter((category) => context[category].length > 0).length;
  if (presentCount === required.length) return "sufficient";
  if (presentCount === 0) return "insufficient";
  return "partial";
}

/**
 * Server-derived confidence — reflects not just whether evidence *existed*
 * (that's `evidenceStatus`) but whether the composed answer actually ended
 * up grounded in it after sanitization:
 *  - "general" is always "high" (no evidence is expected, so none being
 *    used isn't a weakness).
 *  - "insufficient" evidence status → always "low".
 *  - "partial" evidence status → always "medium".
 *  - "sufficient" evidence status, but the route needed citations and/or
 *    fact keys and the sanitized answer ended up with none surviving →
 *    "medium" (the raw evidence existed, but the final answer isn't
 *    demonstrably grounded in it).
 *  - "sufficient" evidence status and the answer is grounded in what it
 *    needed → "high".
 */
export function deriveConfidence(
  context: GroundedContext,
  evidenceStatus: ComposerEvidenceStatus,
  sanitizedCitationCount: number,
  sanitizedFactKeyCount: number,
): ComposerConfidence {
  if (context.route === "general") return "high";
  if (evidenceStatus === "insufficient") return "low";
  if (evidenceStatus === "partial") return "medium";

  const required = ROUTE_EVIDENCE_CATEGORIES[context.route];
  const needsCitations = required.includes("contractEvidence") || required.includes("legalEvidence");
  const needsFactKeys = required.includes("financialFacts");

  const citationsOk = !needsCitations || sanitizedCitationCount > 0;
  const factKeysOk = !needsFactKeys || sanitizedFactKeyCount > 0;

  return citationsOk && factKeysOk ? "high" : "medium";
}
