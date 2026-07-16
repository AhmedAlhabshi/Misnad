import type { GroundedContext } from "@workspace/context-builder";
import { serializeGroundedContext } from "./contextSerializer";

/** The initial user-turn prompt: the serialized, labeled, verbatim evidence plus a short restatement of the task. */
export function buildAnswerPrompt(context: GroundedContext): string {
  return `${serializeGroundedContext(context)}\n\nUsing only the evidence above, answer the question now, following every rule you were given and returning only the required JSON object.`;
}

const MAX_PREVIOUS_RESPONSE_PREVIEW_CHARS = 2000;

export interface BuildAnswerCorrectionPromptParams {
  context: GroundedContext;
  previousResponseText: string;
  validationErrorSummary: string;
}

/**
 * Mirrors `@workspace/contract-analysis`'s existing correction-prompt
 * pattern: re-sends the full original context (never assume the model
 * remembers it), plus the previous invalid response and exactly why it was
 * rejected, and asks for a corrected JSON object only.
 */
export function buildAnswerCorrectionPrompt(params: BuildAnswerCorrectionPromptParams): string {
  const preview = params.previousResponseText.trim().slice(0, MAX_PREVIOUS_RESPONSE_PREVIEW_CHARS);

  return `${serializeGroundedContext(params.context)}

Your previous response did not match the required JSON shape and was rejected. Do not repeat the same mistake.

Validation errors:
${params.validationErrorSummary}

Your previous response (for reference only — it is not valid, do not just resend it):
${preview}

Using only the evidence above, produce a corrected response now: a single JSON object matching exactly the required shape, and nothing else.`;
}
