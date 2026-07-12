export interface ContractAnalysisProviderRequest {
  systemInstructions: string;
  userPrompt: string;
  /**
   * JSON Schema describing the exact shape the model's JSON response must
   * match (already narrowed to the specific contract type). When provided,
   * providers that support structured output must pass it through as the
   * model's response schema rather than relying on prompt text alone.
   */
  jsonSchema?: unknown;
}

/**
 * Safe, non-content diagnostic metadata about a provider response — never
 * includes the response text itself, just facts about it (length, finish
 * reason, token usage) useful for diagnosing validation failures.
 */
export interface ProviderResponseDiagnostics {
  finishReason?: string;
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  rawTextLength: number;
}

export interface ContractAnalysisProviderResponse {
  rawText: string;
  /** Present when the provider can supply it (e.g. the Gemini provider). */
  diagnostics?: ProviderResponseDiagnostics;
}

export interface ContractAnalysisProvider {
  generate(
    request: ContractAnalysisProviderRequest,
  ): Promise<ContractAnalysisProviderResponse>;
}
