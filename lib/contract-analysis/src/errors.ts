export type ContractAnalysisErrorCode =
  | "EMPTY_MASKED_TEXT"
  | "INVALID_CONTRACT_TYPE"
  | "INVALID_ANALYSIS_LANGUAGE"
  | "MISSING_API_KEY"
  | "MISSING_OPENROUTER_API_KEY"
  | "NO_USABLE_RESPONSE"
  | "JSON_PARSE_FAILED"
  | "SCHEMA_VALIDATION_FAILED"
  | "PROVIDER_REQUEST_FAILED"
  | "RATE_LIMITED";

export class ContractAnalysisError extends Error {
  public readonly code: ContractAnalysisErrorCode;

  constructor(code: ContractAnalysisErrorCode, message: string) {
    super(message);
    this.name = "ContractAnalysisError";
    this.code = code;
  }
}

export function emptyMaskedTextError(): ContractAnalysisError {
  return new ContractAnalysisError(
    "EMPTY_MASKED_TEXT",
    "maskedText must be a non-empty string.",
  );
}

export function invalidContractTypeError(): ContractAnalysisError {
  return new ContractAnalysisError(
    "INVALID_CONTRACT_TYPE",
    "contractType is not a recognized contract type.",
  );
}

export function invalidAnalysisLanguageError(): ContractAnalysisError {
  return new ContractAnalysisError(
    "INVALID_ANALYSIS_LANGUAGE",
    "analysisLanguage is not a recognized analysis language.",
  );
}

export function missingApiKeyError(): ContractAnalysisError {
  return new ContractAnalysisError(
    "MISSING_API_KEY",
    "GEMINI_API_KEY is not configured. Set it before calling the contract analysis service.",
  );
}

export function missingOpenRouterApiKeyError(): ContractAnalysisError {
  return new ContractAnalysisError(
    "MISSING_OPENROUTER_API_KEY",
    "OPENROUTER_API_KEY is not configured. Set it before the OpenRouter fallback can be used.",
  );
}

export function noUsableResponseError(): ContractAnalysisError {
  return new ContractAnalysisError(
    "NO_USABLE_RESPONSE",
    "The AI provider did not return any usable text or JSON content.",
  );
}

export function jsonParseFailedError(): ContractAnalysisError {
  return new ContractAnalysisError(
    "JSON_PARSE_FAILED",
    "The AI provider's response could not be parsed as JSON.",
  );
}

export function schemaValidationFailedError(): ContractAnalysisError {
  return new ContractAnalysisError(
    "SCHEMA_VALIDATION_FAILED",
    "The AI provider's response did not match the expected contract understanding structure after a correction attempt.",
  );
}

export function providerRequestFailedError(): ContractAnalysisError {
  return new ContractAnalysisError(
    "PROVIDER_REQUEST_FAILED",
    "The AI provider rejected the analysis request.",
  );
}

export function rateLimitedError(): ContractAnalysisError {
  return new ContractAnalysisError(
    "RATE_LIMITED",
    "The AI provider rejected the request due to rate limits or usage quotas.",
  );
}
