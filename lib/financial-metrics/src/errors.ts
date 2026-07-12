export type FinancialMetricsEngineErrorCode =
  | "INVALID_INPUT"
  | "INVALID_REFERENCE_DATE"
  | "OUTPUT_VALIDATION_FAILED";

/**
 * Thrown only for structural problems the engine cannot reasonably proceed
 * from (a malformed `ContractUnderstanding`, an invalid `referenceDate`, or
 * an internal invariant violation surfaced by output validation). Missing or
 * incomplete *financial* data is never an error — it produces partial
 * metrics with explicit `"unavailable"` fields instead.
 */
export class FinancialMetricsEngineError extends Error {
  public readonly code: FinancialMetricsEngineErrorCode;

  constructor(code: FinancialMetricsEngineErrorCode, message: string) {
    super(message);
    this.name = "FinancialMetricsEngineError";
    this.code = code;
  }
}

export function invalidInputError(message: string): FinancialMetricsEngineError {
  return new FinancialMetricsEngineError("INVALID_INPUT", message);
}

export function invalidReferenceDateError(referenceDate: string): FinancialMetricsEngineError {
  return new FinancialMetricsEngineError(
    "INVALID_REFERENCE_DATE",
    `referenceDate "${referenceDate}" is not a valid ISO calendar date (YYYY-MM-DD).`,
  );
}

export function outputValidationFailedError(message: string): FinancialMetricsEngineError {
  return new FinancialMetricsEngineError(
    "OUTPUT_VALIDATION_FAILED",
    `The calculated financial metrics failed schema validation: ${message}`,
  );
}
