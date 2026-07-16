import type { ChatRouteDecision, ChatSourceKind } from "@workspace/chat-router";
import type { ContractUnderstanding } from "@workspace/contract-schema";
import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import { collectAnalysisFacts } from "./analysisCollector";
import { collectContractEvidence, type ContractRetrieverDeps } from "./contractRetriever";
import { DEFAULT_MAX_TOKEN_BUDGET, enforceTokenBudget } from "./budget";
import { collectFinancialFacts } from "./financialCollector";
import { collectLegalEvidence, type LegalRetrieverDeps } from "./legalRetriever";
import { mergeContext } from "./mergeContext";
import { DEFAULT_RANKING_LIMITS, dedupeAndRank, type RankingLimits } from "./ranking";
import type { AnalysisFactItem, ContractEvidenceItem, FinancialFactItem, GroundedContext, LegalEvidenceItem } from "./schema";

export interface BuildGroundedContextInput {
  routeDecision: ChatRouteDecision;
  /**
   * The original, human-readable question — deliberately NOT
   * `routeDecision.normalizedQuestion` (that string has diacritics,
   * casing, and punctuation stripped specifically for chat-router's own
   * pattern matching; it is a poor retrieval query and an even worse thing
   * to echo back to a user in `GroundedContext.question`).
   */
  question: string;
  contractRagSessionId: string | null;
  contractType: ContractType;
  answerLanguage: AnalysisLanguage;
  contractAnalysis: ContractUnderstanding | null;
  financialMetrics: FinancialMetrics | null;
}

export interface BuildGroundedContextDeps {
  contractRag?: ContractRetrieverDeps;
  legalRag?: LegalRetrieverDeps;
  rankingLimits?: Partial<RankingLimits>;
  maxTokenBudget?: number;
}

function isRequired(routeDecision: ChatRouteDecision, source: ChatSourceKind): boolean {
  return routeDecision.requiredSources.some((entry) => entry.source === source);
}

function isRequiredAndAvailable(routeDecision: ChatRouteDecision, source: ChatSourceKind): boolean {
  return routeDecision.requiredSources.some((entry) => entry.source === source && entry.available);
}

/**
 * Builds the one structured `GroundedContext` object a future answer
 * composer will send to the LLM — this function never calls an LLM
 * itself, never generates prose, and never changes `routeDecision.route`
 * or its source requirements. It only decides, per the route the Chat
 * Router already chose, which of Contract RAG / Legal RAG / financial
 * metrics / the contract-analysis summary to read, then ranks, deduplicates,
 * and budgets whatever came back.
 *
 * `sourcesUsed` mirrors `routeDecision.requiredSources` filtered to
 * `available === true` — it reports which trusted sources this route
 * legitimately draws on, not merely which ones happened to return
 * evidence this time (an available-but-empty source is still a source
 * this route "used"; see `warnings` for whether it actually contributed
 * anything).
 */
export async function buildGroundedContext(input: BuildGroundedContextInput, deps: BuildGroundedContextDeps = {}): Promise<GroundedContext> {
  const limits = { ...DEFAULT_RANKING_LIMITS, ...deps.rankingLimits };
  const maxTokenBudget = deps.maxTokenBudget ?? DEFAULT_MAX_TOKEN_BUDGET;

  const { routeDecision } = input;
  const route = routeDecision.route;

  const warnings: string[] = [];
  const sourcesUsed: ChatSourceKind[] = routeDecision.requiredSources.filter((entry) => entry.available).map((entry) => entry.source);

  let contractEvidence: ContractEvidenceItem[] = [];
  let legalEvidence: LegalEvidenceItem[] = [];
  let financialFacts: FinancialFactItem[] = [];
  let analysisFacts: AnalysisFactItem[] = [];

  if (isRequired(routeDecision, "contract")) {
    if (!isRequiredAndAvailable(routeDecision, "contract")) {
      warnings.push("source_unavailable:contract — not queried, Contract RAG marked unavailable by chat router");
    } else {
      const outcome = await collectContractEvidence(input.contractRagSessionId, input.question, input.answerLanguage, deps.contractRag ?? null);
      contractEvidence = outcome.evidence;
      warnings.push(...outcome.warnings);
    }
  }

  if (isRequired(routeDecision, "legal")) {
    if (!isRequiredAndAvailable(routeDecision, "legal")) {
      warnings.push("source_unavailable:legal — not queried, Legal RAG marked unavailable by chat router");
    } else {
      const outcome = await collectLegalEvidence(input.question, input.contractType, deps.legalRag ?? null);
      legalEvidence = outcome.evidence;
      warnings.push(...outcome.warnings);
    }
  }

  if (isRequired(routeDecision, "financial")) {
    if (!isRequiredAndAvailable(routeDecision, "financial")) {
      warnings.push("source_unavailable:financial — not queried, financial metrics marked unavailable by chat router");
    } else if (!input.financialMetrics) {
      warnings.push("financial_facts_empty: no financialMetrics object was provided");
    } else {
      financialFacts = collectFinancialFacts(input.financialMetrics);
      if (financialFacts.length === 0) {
        warnings.push("financial_facts_empty: financialMetrics contained no known/estimated values");
      }
    }
  }

  // Per this milestone's route responsibilities, the contract-analysis
  // summary is only ever gathered for the "all" route.
  if (route === "all") {
    if (!input.contractAnalysis) {
      warnings.push("analysis_facts_empty: no contractAnalysis object was provided");
    } else {
      analysisFacts = collectAnalysisFacts(input.contractAnalysis, limits.maxAnalysisFacts);
      if (analysisFacts.length === 0) {
        warnings.push("analysis_facts_empty: contractAnalysis contained no extractable facts");
      }
    }
  }

  const rankedContract = dedupeAndRank(contractEvidence, (item) => item.chunkId, limits.maxContractEvidence);
  const rankedLegal = dedupeAndRank(legalEvidence, (item) => item.chunkId, limits.maxLegalEvidence);
  const rankedFinancial = dedupeAndRank(financialFacts, (item) => item.factKey, limits.maxFinancialFacts);
  const rankedAnalysis = dedupeAndRank(analysisFacts, (item) => item.factKey, limits.maxAnalysisFacts);

  const budgetResult = enforceTokenBudget(
    { contractEvidence: rankedContract, legalEvidence: rankedLegal, financialFacts: rankedFinancial, analysisFacts: rankedAnalysis },
    maxTokenBudget,
  );
  if (budgetResult.trimmed) {
    warnings.push(`evidence_trimmed_for_token_budget: reduced to fit maxTokenBudget=${maxTokenBudget}`);
  }

  return mergeContext({
    route,
    question: input.question,
    language: input.answerLanguage,
    contractType: input.contractType,
    sourcesUsed,
    contractEvidence: budgetResult.pools.contractEvidence,
    legalEvidence: budgetResult.pools.legalEvidence,
    financialFacts: budgetResult.pools.financialFacts,
    analysisFacts: budgetResult.pools.analysisFacts,
    tokenEstimate: budgetResult.tokenEstimate,
    warnings,
  });
}
