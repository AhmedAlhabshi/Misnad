import type { AnalysisLanguage } from "@workspace/contract-types";
import type { RiskLevel } from "@/types/analysis";
import type { ContractAnalysisResult } from "@/types/analysis";
import type { FinancialConceptItem } from "@/lib/financialConcepts";
import { isStatedCapText } from "@/lib/financialConcepts";
import { getCanonicalConceptLabel } from "@/lib/financialMetricsCopy";
import { formatMoneyMetric, formatPercentageMetric } from "@/lib/financialFormatters";
import { sanitizeDisplayText } from "@/lib/textSanitization";
import { deduplicateClauses } from "@/lib/clauseDedup";

const MAX_FINDINGS = 5;
const MAX_RISK_CLAUSE_FINDINGS = 3;
const MAX_CONDITIONAL_FINDINGS = 2;
const MAX_MISSING_INFO_FINDINGS = 1;

const PERCENT_SIGN: Record<AnalysisLanguage, string> = { ar: "٪", en: "%" };

export type ExecutiveFindingKind = "risk_clause" | "conditional_cost" | "missing_information";

export interface ExecutiveFinding {
  kind: ExecutiveFindingKind;
  title: string;
  description: string;
  riskLevel?: RiskLevel | null;
}

const RISK_RANK: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };

/**
 * The client-side-only "3-5 most important findings" ranker required by
 * the Executive Summary section. Deterministic view logic over data the
 * app has already fetched — no new AI call, no new endpoint, no new
 * business logic: it only selects and orders (a) the highest-risk clauses
 * (reusing the same `deduplicateClauses` the Clauses section itself uses),
 * (b) the largest conditional/potential financial amounts, and (c) any
 * stated missing-information reasons the backend already returned.
 */
export function buildExecutiveSummary(
  analysis: ContractAnalysisResult,
  concepts: readonly FinancialConceptItem[],
  language: AnalysisLanguage,
): ExecutiveFinding[] {
  const findings: ExecutiveFinding[] = [];

  const riskyClauses = deduplicateClauses(analysis.importantClauses)
    .filter((clause) => clause.riskLevel === "high" || clause.riskLevel === "medium")
    .sort((a, b) => RISK_RANK[a.riskLevel as RiskLevel] - RISK_RANK[b.riskLevel as RiskLevel])
    .slice(0, MAX_RISK_CLAUSE_FINDINGS);

  for (const clause of riskyClauses) {
    const title = sanitizeDisplayText(clause.title);
    const description = sanitizeDisplayText(clause.plainExplanation) ?? sanitizeDisplayText(clause.summary);
    if (!title || !description) continue;
    findings.push({ kind: "risk_clause", title, description, riskLevel: clause.riskLevel });
  }

  const percentSign = PERCENT_SIGN[language];
  const conditionalItems = concepts
    .filter((item) => item.bucket === "conditional" && (item.amount.value !== null || item.percentage?.value !== null))
    .sort((a, b) => (b.amount.value ?? b.percentage?.value ?? 0) - (a.amount.value ?? a.percentage?.value ?? 0))
    .slice(0, MAX_CONDITIONAL_FINDINGS);

  for (const item of conditionalItems) {
    const label = item.conceptId === "other" ? sanitizeDisplayText(item.label) : getCanonicalConceptLabel(item.conceptId, language);
    if (!label) continue;
    const money = formatMoneyMetric(item.amount, language, "");
    const rawAmountText = money.kind === "value" ? money.text : item.percentage ? formatPercentageMetric(item.percentage, language, "", percentSign).text : null;
    const upToPrefix = language === "ar" ? "حتى" : "up to";
    const amountText = rawAmountText ? (isStatedCapText(item) ? `${upToPrefix} ${rawAmountText}` : rawAmountText) : null;
    const trigger = sanitizeDisplayText(item.trigger);
    const parts = [amountText, trigger].filter((part): part is string => Boolean(part));
    findings.push({ kind: "conditional_cost", title: label, description: parts.join(" — ") || label });
  }

  const missingReasons = analysis.missingInformation
    .map((item) => sanitizeDisplayText(item.reason))
    .filter((reason): reason is string => Boolean(reason))
    .slice(0, MAX_MISSING_INFO_FINDINGS);

  const missingCopy = language === "ar" ? "معلومات غير مكتملة" : "Incomplete information";
  for (const reason of missingReasons) {
    findings.push({ kind: "missing_information", title: missingCopy, description: reason });
  }

  return findings.slice(0, MAX_FINDINGS);
}
