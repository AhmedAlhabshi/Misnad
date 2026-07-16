import { indexContractSession, PostgresContractRagRepository, type MaskedContractDocument } from "@workspace/contract-rag";
import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import { GeminiEmbeddingProvider } from "@workspace/legal-rag";

export interface ContractRagIndexResult {
  sessionId: string;
}

/**
 * Thin production wiring around `indexContractSession`: the real
 * Postgres-backed repository plus the real Gemini embedding provider.
 * Callers must only ever pass the already-masked text produced by the
 * analyze-contract route's PII-masking stage — never raw extracted text.
 */
export async function indexContractRagSession(
  maskedDocument: MaskedContractDocument,
  contractType: ContractType,
  analysisLanguage: AnalysisLanguage,
): Promise<ContractRagIndexResult> {
  const repository = new PostgresContractRagRepository();
  const embeddingProvider = new GeminiEmbeddingProvider();
  const result = await indexContractSession({ maskedDocument, contractType, analysisLanguage }, { repository, embeddingProvider });
  return { sessionId: result.sessionId };
}
