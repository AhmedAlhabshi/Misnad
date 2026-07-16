export { composeAnswer, type ComposeAnswerOptions } from "./composer";
export { ComposerError, type ComposerErrorCode } from "./errors";
export { ContractAnalysisError } from "@workspace/contract-analysis";

export {
  composedAnswerSchema,
  composedCitationSchema,
  composerCitationSourceSchema,
  composerConfidenceSchema,
  composerEvidenceStatusSchema,
  composerLanguageSchema,
  llmCitationRefSchema,
  llmComposerResponseSchema,
  type ComposedAnswer,
  type ComposedCitation,
  type ComposerCitationSource,
  type ComposerConfidence,
  type ComposerEvidenceStatus,
  type ComposerLanguage,
  type LlmCitationRef,
  type LlmComposerResponse,
} from "./schema";

export { buildSystemInstructions } from "./systemPrompt";
export { serializeGroundedContext } from "./contextSerializer";
export { buildAnswerCorrectionPrompt, buildAnswerPrompt, type BuildAnswerCorrectionPromptParams } from "./answerPrompt";
export { buildCitationAllowlist, buildFactKeyAllowlist, sanitizeCitations, sanitizeFactKeys, type CitationAllowlistEntry } from "./citationAllowlist";
export { deriveConfidence, deriveEvidenceStatus } from "./evidencePolicy";
export { sanitizeComposerResponse } from "./responseSanitizer";
