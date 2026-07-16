import type { ContractType } from "@workspace/contract-types";
import { retrieveLegalContext, type EmbeddingProvider, type LegalChunkRepository } from "@workspace/legal-rag";
import { clampRelevanceScore } from "./ranking";
import type { LegalEvidenceItem } from "./schema";

export interface LegalRetrieverDeps {
  repository: LegalChunkRepository;
  embeddingProvider: EmbeddingProvider;
}

export interface LegalRetrievalOutcome {
  evidence: LegalEvidenceItem[];
  /** True once `retrieveLegalContext` was actually invoked against real deps — false when skipped entirely (no deps provided). */
  attempted: boolean;
  warnings: string[];
}

/**
 * Thin wrapper over `@workspace/legal-rag`'s own `retrieveLegalContext` —
 * that service already enforces citation validity (see its own
 * `filterValidCitations` call), so every item this function returns
 * already carries a real, verified `officialSourceUrl`. This function adds
 * no new citation of its own; `citation` here is exactly that URL, and
 * `excerpt` is copied verbatim, never edited.
 */
export async function collectLegalEvidence(
  question: string,
  contractType: ContractType,
  deps: LegalRetrieverDeps | null,
): Promise<LegalRetrievalOutcome> {
  if (!deps) {
    return { evidence: [], attempted: false, warnings: ["legal_evidence_skipped: Legal RAG dependencies not provided"] };
  }

  const result = await retrieveLegalContext({ query: question, contractType }, deps);

  if (result.status !== "results_found") {
    return {
      evidence: [],
      attempted: true,
      warnings: [`legal_evidence_empty: retrieveLegalContext returned status "${result.status}"`],
    };
  }

  const evidence: LegalEvidenceItem[] = result.results.map((item) => ({
    source: "legal",
    authority: item.authority,
    citation: item.officialSourceUrl,
    relevanceScore: clampRelevanceScore(item.score),
    excerpt: item.excerpt,
    chunkId: item.chunkId,
    documentTitle: item.documentTitle,
    articleNumber: item.articleNumber,
    section: item.section,
  }));

  return { evidence, attempted: true, warnings: [] };
}
