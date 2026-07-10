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

export interface ContractAnalysisProviderResponse {
  rawText: string;
}

export interface ContractAnalysisProvider {
  generate(
    request: ContractAnalysisProviderRequest,
  ): Promise<ContractAnalysisProviderResponse>;
}
