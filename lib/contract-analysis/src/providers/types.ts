export interface ContractAnalysisProviderRequest {
  systemInstructions: string;
  userPrompt: string;
}

export interface ContractAnalysisProviderResponse {
  rawText: string;
}

export interface ContractAnalysisProvider {
  generate(
    request: ContractAnalysisProviderRequest,
  ): Promise<ContractAnalysisProviderResponse>;
}
