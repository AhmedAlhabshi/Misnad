import type { AnalysisLanguage } from "@workspace/contract-types";
import { retrieveContractContext, type ContractRagRepository } from "@workspace/contract-rag";
import type { EmbeddingProvider } from "@workspace/legal-rag";
import { clampRelevanceScore } from "./ranking";
import type { ContractEvidenceItem } from "./schema";

/** Not an external authority — this evidence comes from the user's own uploaded contract, never from a third-party source. Kept as a named constant so every contract-evidence item attributes consistently. */
export const CONTRACT_EVIDENCE_AUTHORITY = "user_contract";

export interface ContractRetrieverDeps {
  repository: ContractRagRepository;
  embeddingProvider: EmbeddingProvider;
}

export interface ContractRetrievalOutcome {
  evidence: ContractEvidenceItem[];
  /** True once `retrieveContractContext` was actually invoked against real deps — false when skipped entirely (no session id, no deps). */
  attempted: boolean;
  warnings: string[];
}

/** A section reference when the chunker found one; otherwise a 1-indexed passage number — never an invented section name. */
function citationFor(section: string | null, chunkOrder: number): string {
  return section ? `Your contract — ${section}` : `Your contract — passage ${chunkOrder + 1}`;
}

/**
 * Thin wrapper over `@workspace/contract-rag`'s own `retrieveContractContext`.
 * Performs no additional ranking of its own — every excerpt is copied
 * verbatim from the retrieval result (see `ContractEvidenceItem.excerpt`),
 * never edited or reworded. `ranking.ts`'s `dedupeAndRank` is applied
 * later, by the orchestrator, on top of whatever this returns.
 */
export async function collectContractEvidence(
  sessionId: string | null,
  question: string,
  language: AnalysisLanguage,
  deps: ContractRetrieverDeps | null,
): Promise<ContractRetrievalOutcome> {
  if (!sessionId) {
    return { evidence: [], attempted: false, warnings: ["contract_evidence_skipped: no contractRagSessionId available"] };
  }
  if (!deps) {
    return { evidence: [], attempted: false, warnings: ["contract_evidence_skipped: Contract RAG dependencies not provided"] };
  }

  const result = await retrieveContractContext({ sessionId, query: question, language }, deps);

  if (result.status !== "results_found") {
    return {
      evidence: [],
      attempted: true,
      warnings: [`contract_evidence_empty: retrieveContractContext returned status "${result.status}"`],
    };
  }

  const evidence: ContractEvidenceItem[] = result.results.map((item) => ({
    source: "contract",
    authority: CONTRACT_EVIDENCE_AUTHORITY,
    citation: citationFor(item.section, item.chunkOrder),
    relevanceScore: clampRelevanceScore(item.score),
    excerpt: item.excerpt,
    chunkId: item.chunkId,
    section: item.section,
    chunkOrder: item.chunkOrder,
  }));

  return { evidence, attempted: true, warnings: [] };
}
