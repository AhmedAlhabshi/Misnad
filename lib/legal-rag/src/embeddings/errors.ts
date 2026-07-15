export type EmbeddingErrorCode =
  | "MISSING_API_KEY"
  | "EMPTY_INPUT"
  | "INPUT_TOO_LARGE"
  | "PROVIDER_REQUEST_FAILED"
  | "DIMENSION_MISMATCH"
  | "NO_USABLE_EMBEDDING";

export class EmbeddingError extends Error {
  public readonly code: EmbeddingErrorCode;

  constructor(code: EmbeddingErrorCode, message: string) {
    super(message);
    this.name = "EmbeddingError";
    this.code = code;
  }
}

export function missingApiKeyError(): EmbeddingError {
  return new EmbeddingError("MISSING_API_KEY", "GEMINI_API_KEY is not configured. Set it before calling the embedding provider.");
}

export function emptyInputError(): EmbeddingError {
  return new EmbeddingError("EMPTY_INPUT", "Text to embed must be a non-empty string.");
}

export function inputTooLargeError(maxChars: number): EmbeddingError {
  return new EmbeddingError("INPUT_TOO_LARGE", `Text to embed exceeds the maximum allowed length of ${maxChars} characters.`);
}

export function providerRequestFailedError(detail?: string): EmbeddingError {
  return new EmbeddingError("PROVIDER_REQUEST_FAILED", detail ? `The embedding provider rejected the request: ${detail}` : "The embedding provider rejected the request.");
}

export function dimensionMismatchError(expected: number, actual: number): EmbeddingError {
  return new EmbeddingError("DIMENSION_MISMATCH", `Expected an embedding of ${expected} dimensions but received ${actual}.`);
}

export function noUsableEmbeddingError(): EmbeddingError {
  return new EmbeddingError("NO_USABLE_EMBEDDING", "The embedding provider did not return any usable vector.");
}
