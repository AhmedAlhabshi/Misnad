import type { AnalysisFactItem, ContractEvidenceItem, FinancialFactItem, LegalEvidenceItem } from "./schema";

export const DEFAULT_MAX_TOKEN_BUDGET = 4000;

/**
 * ~4 characters per token is a standard rough heuristic for mixed
 * Arabic/English text when no real tokenizer is available — this package
 * never calls an LLM or a tokenizer service (per this milestone's explicit
 * constraint), so this is an approximation, documented as such, not a
 * precise count.
 */
const CHARS_PER_TOKEN_ESTIMATE = 4;

/** Flat per-item allowance for the citation/authority/source wrapper text that will surround each excerpt in the eventual prompt — an approximation, not measured against a real prompt template (that template doesn't exist yet; building it is explicitly out of scope for this milestone). */
const STRUCTURAL_TOKENS_PER_EVIDENCE_ITEM = 20;

/** Flat allowance for the question/route/instruction text that isn't per-evidence-item. */
const BASE_TOKEN_OVERHEAD = 50;

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

function estimateEvidenceTokens(excerpt: string): number {
  return estimateTextTokens(excerpt) + STRUCTURAL_TOKENS_PER_EVIDENCE_ITEM;
}

export interface EvidencePools {
  contractEvidence: ContractEvidenceItem[];
  legalEvidence: LegalEvidenceItem[];
  financialFacts: FinancialFactItem[];
  analysisFacts: AnalysisFactItem[];
}

export interface BudgetResult {
  pools: EvidencePools;
  tokenEstimate: number;
  /** True when at least one evidence item was removed to fit the budget. */
  trimmed: boolean;
}

type PoolKey = keyof EvidencePools;
const POOL_KEYS: readonly PoolKey[] = ["contractEvidence", "legalEvidence", "financialFacts", "analysisFacts"];

/**
 * Computes a total token estimate across every evidence pool and, if it
 * exceeds `maxTokenBudget`, repeatedly removes the single globally
 * lowest-relevance-score item (regardless of which pool it's in) until
 * either the estimate fits or only one evidence item remains in total —
 * this floor is deliberate: "never remove all evidence" takes priority
 * over strictly enforcing the budget, so a caller downstream always has at
 * least one grounded fact to work with, even if it costs more tokens than
 * the nominal budget allows.
 */
export function enforceTokenBudget(pools: EvidencePools, maxTokenBudget: number): BudgetResult {
  const flat: Array<{ pool: PoolKey; index: number; tokens: number; relevanceScore: number }> = [];
  for (const poolKey of POOL_KEYS) {
    pools[poolKey].forEach((item, index) => {
      flat.push({ pool: poolKey, index, tokens: estimateEvidenceTokens(item.excerpt), relevanceScore: item.relevanceScore });
    });
  }

  let total = BASE_TOKEN_OVERHEAD + flat.reduce((sum, entry) => sum + entry.tokens, 0);
  let remainingCount = flat.length;
  let trimmed = false;
  const removed = new Set<string>();

  const ascendingByRelevance = [...flat].sort((a, b) => a.relevanceScore - b.relevanceScore);

  for (const candidate of ascendingByRelevance) {
    if (total <= maxTokenBudget) break;
    if (remainingCount <= 1) break;
    removed.add(`${candidate.pool}:${candidate.index}`);
    total -= candidate.tokens;
    remainingCount -= 1;
    trimmed = true;
  }

  const nextPools: EvidencePools = {
    contractEvidence: pools.contractEvidence.filter((_, index) => !removed.has(`contractEvidence:${index}`)),
    legalEvidence: pools.legalEvidence.filter((_, index) => !removed.has(`legalEvidence:${index}`)),
    financialFacts: pools.financialFacts.filter((_, index) => !removed.has(`financialFacts:${index}`)),
    analysisFacts: pools.analysisFacts.filter((_, index) => !removed.has(`analysisFacts:${index}`)),
  };

  return { pools: nextPools, tokenEstimate: total, trimmed };
}
