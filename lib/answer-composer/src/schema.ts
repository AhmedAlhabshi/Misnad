import { z } from "zod/v4";
import { CHAT_ROUTES } from "@workspace/chat-router";

/**
 * Uses "zod/v4" (not plain "zod") specifically so this schema is
 * interoperable with `@workspace/contract-schema`'s `toGeminiJsonSchema` —
 * the same convention `contract-schema`/`financial-metrics` already use,
 * for the same reason.
 */

export const COMPOSER_CITATION_SOURCES = ["contract", "legal"] as const;
export const composerCitationSourceSchema = z.enum(COMPOSER_CITATION_SOURCES);
export type ComposerCitationSource = z.infer<typeof composerCitationSourceSchema>;

export const composerLanguageSchema = z.enum(["AR", "EN"]);
export type ComposerLanguage = z.infer<typeof composerLanguageSchema>;

export const composerConfidenceSchema = z.enum(["high", "medium", "low"]);
export type ComposerConfidence = z.infer<typeof composerConfidenceSchema>;

export const composerEvidenceStatusSchema = z.enum(["sufficient", "partial", "insufficient"]);
export type ComposerEvidenceStatus = z.infer<typeof composerEvidenceStatusSchema>;

/**
 * A citation as it appears in the FINAL, sanitized response — every field
 * here is reconstructed server-side from the matching `GroundedContext`
 * evidence item (see `citationAllowlist.ts`), never copied from what the
 * model said about itself. Only `source: "contract" | "legal"` — financial
 * and analysis facts are never citable as an external/legal source (see
 * `usedFinancialFactKeys` for how a financial fact is referenced instead).
 */
export const composedCitationSchema = z.object({
  source: composerCitationSourceSchema,
  label: z.string().min(1),
  citation: z.string().min(1),
  authority: z.string().min(1).optional(),
  excerpt: z.string().optional(),
});
export type ComposedCitation = z.infer<typeof composedCitationSchema>;

/**
 * The one structured object this package produces. `confidence` and
 * `evidenceStatus` are never taken from the model — see
 * `evidencePolicy.ts` for how they're derived server-side. `citations` and
 * `usedFinancialFactKeys` are always the sanitized/filtered result (see
 * `citationAllowlist.ts`), never the model's raw, unverified claims.
 */
export const composedAnswerSchema = z.object({
  answer: z.string().min(1),
  language: composerLanguageSchema,
  route: z.enum(CHAT_ROUTES),
  confidence: composerConfidenceSchema,
  evidenceStatus: composerEvidenceStatusSchema,
  citations: z.array(composedCitationSchema),
  usedFinancialFactKeys: z.array(z.string().min(1)),
  warnings: z.array(z.string()),
  provider: z.string().min(1),
  model: z.string().min(1).optional(),
});
export type ComposedAnswer = z.infer<typeof composedAnswerSchema>;

/**
 * A citation the model CLAIMS to be using — deliberately minimal (just
 * enough to match against the allowlist). The model is never asked for
 * `label`/`authority`/`excerpt` here because those would only ever be
 * echoed back untrusted; the real values are looked up server-side from
 * whichever allowlist entry actually matches `source` + `citation`.
 */
export const llmCitationRefSchema = z.object({
  source: composerCitationSourceSchema,
  citation: z.string().min(1),
});
export type LlmCitationRef = z.infer<typeof llmCitationRefSchema>;

/** Generous but bounded — protects against a runaway/repeating generation without constraining a genuinely thorough answer. */
const MAX_ANSWER_CHARS = 6000;
const MAX_CITATIONS = 20;
const MAX_FACT_KEYS = 30;

/**
 * The exact shape the LLM itself is asked to produce (see
 * `systemPrompt.ts`'s JSON output instructions) and the only shape
 * validated immediately after a provider call, before any sanitization.
 * Confidence, evidenceStatus, provider, model, and every citation's
 * label/authority/excerpt are deliberately absent here — none of those are
 * ever taken from the model.
 */
export const llmComposerResponseSchema = z.object({
  answer: z.string().min(1).max(MAX_ANSWER_CHARS),
  citations: z.array(llmCitationRefSchema).max(MAX_CITATIONS),
  usedFinancialFactKeys: z.array(z.string().min(1)).max(MAX_FACT_KEYS),
});
export type LlmComposerResponse = z.infer<typeof llmComposerResponseSchema>;
