/**
 * Composer-specific error codes only — a provider-level failure (missing
 * API key, rate limit, provider request failure, no usable response) still
 * throws `@workspace/contract-analysis`'s own `ContractAnalysisError`
 * unchanged (that error type is reused, not wrapped or redefined here), so
 * a caller can tell "the AI provider itself failed" apart from "the
 * composer received a response but couldn't turn it into a valid,
 * sanitized answer".
 */
export type ComposerErrorCode = "INVALID_GROUNDED_CONTEXT" | "SCHEMA_VALIDATION_FAILED";

export class ComposerError extends Error {
  public readonly code: ComposerErrorCode;

  constructor(code: ComposerErrorCode, message: string) {
    super(message);
    this.name = "ComposerError";
    this.code = code;
  }
}

export function invalidGroundedContextError(): ComposerError {
  return new ComposerError(
    "INVALID_GROUNDED_CONTEXT",
    "The provided GroundedContext failed validation — the answer composer only accepts a context already produced by @workspace/context-builder.",
  );
}

export function composerSchemaValidationFailedError(): ComposerError {
  return new ComposerError(
    "SCHEMA_VALIDATION_FAILED",
    "The AI provider's response did not match the expected answer structure after a correction attempt.",
  );
}
