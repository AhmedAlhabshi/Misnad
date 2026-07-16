import type { ContractUnderstanding } from "@workspace/contract-schema";
import type { AnalysisFactItem } from "./schema";

/** Distinct from `financial_metrics_engine` and `user_contract` — this is the AI contract-analysis engine's already-produced output, surfaced here, not re-summarized. */
export const ANALYSIS_FACT_AUTHORITY = "contract_analysis_engine";

const CONTRACT_SUMMARY_RELEVANCE = 0.9;
const IMPORTANT_CLAUSE_RELEVANCE = 0.8;
const MISSING_INFORMATION_RELEVANCE = 0.5;

function fact(factKey: string, label: string, excerpt: string, relevanceScore: number, citationSuffix: string): AnalysisFactItem {
  return {
    source: "analysis",
    authority: ANALYSIS_FACT_AUTHORITY,
    citation: `contractAnalysis.${citationSuffix}`,
    relevanceScore,
    excerpt,
    factKey,
    label,
  };
}

/**
 * Surfaces only the top-level `contractSummary` and the already-extracted
 * `importantClauses` (title + summary, joined with a fixed "—" separator)
 * — every string here already existed verbatim in `analysis`, produced by
 * a prior contract-analysis call. This function performs no summarization
 * of its own: it selects and packages existing fields, it never condenses
 * multiple clauses into new prose. Only called for the "all" route (see
 * `contextBuilder.ts`), per this milestone's route responsibilities.
 */
export function collectAnalysisFacts(analysis: ContractUnderstanding | null, maxClauses: number): AnalysisFactItem[] {
  if (!analysis) return [];
  const facts: AnalysisFactItem[] = [];

  if (analysis.contractSummary.trim().length > 0) {
    facts.push(fact("contract_summary", "Contract summary", analysis.contractSummary, CONTRACT_SUMMARY_RELEVANCE, "contractSummary"));
  }

  analysis.importantClauses.slice(0, maxClauses).forEach((clause, index) => {
    facts.push(
      fact(
        `important_clause:${index}`,
        `Clause: ${clause.title}`,
        `${clause.title} — ${clause.summary}`,
        IMPORTANT_CLAUSE_RELEVANCE,
        `importantClauses[${index}]`,
      ),
    );
  });

  if (analysis.missingInformation.length > 0) {
    const fields = analysis.missingInformation.map((item) => item.field).join(", ");
    facts.push(fact("missing_information", "Missing information", `Missing information: ${fields}`, MISSING_INFORMATION_RELEVANCE, "missingInformation"));
  }

  return facts;
}
