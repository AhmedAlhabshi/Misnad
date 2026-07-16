import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult, RiskLevel } from "@/types/analysis";
import type { PersonalizedAnalysisSessionState } from "@/hooks/usePersonalizedAnalysisSession";
import { buildContractTitleParts, buildContractTitleText } from "@/lib/contractTitle";
import { deduplicateClauses } from "@/lib/clauseDedup";
import { riskRank } from "@/lib/financialPresentation";
import { sanitizeDisplayText } from "@/lib/textSanitization";
import {
  buildDurationFacts,
  buildFinancialConcepts,
  selectApplicableMonthlyOutflow,
  type CanonicalConceptId,
  type FinancialConceptItem,
} from "@/lib/financialConcepts";
import { getCanonicalConceptLabel } from "@/lib/financialMetricsCopy";
import { FINANCIAL_METRICS_COPY } from "@/lib/financialMetricsCopy";
import { formatContractDuration, formatMoneyMetric, formatPercentageMetric } from "@/lib/financialFormatters";
import { parseBudgetInputValue } from "@/lib/budgetImpact";
import { REPORT_SUMMARY_COPY } from "@/lib/reportSummaryCopy";

/**
 * UI-independent report data model — the ONLY thing the PDF generator reads.
 * Every field here is a final, already-formatted display value (or null/
 * omitted when genuinely unavailable) — the generator never re-derives,
 * re-formats, or re-fetches anything.
 */
export interface ReportSummaryData {
  language: AnalysisLanguage;
  generatedAt: string;
  contract: {
    title: string;
    typeLabel: string;
    overallRisk?: RiskLevel | null;
    duration?: string | null;
  };
  keyFinancialFigures: Array<{ key: string; label: string; value: string }>;
  importantFindings: Array<{ title: string; summary: string; riskLevel?: RiskLevel | null }>;
  conclusion: string;
  personalized?: {
    monthlyIncome: string;
    existingMonthlyObligations: string;
    newContractCommitment: string;
    totalMonthlyObligations: string;
    obligationToIncomeRatio: string;
    remainingMonthlyAmount: string;
    conclusion: string;
  };
}

const PERCENT_SIGN: Record<AnalysisLanguage, string> = { ar: "٪", en: "%" };

/** Lower rank sorts first — mirrors `riskRank` but works directly on a `RiskLevel | null`. */
function worstRiskLevel(clauses: readonly { riskLevel: RiskLevel | null }[]): RiskLevel | null {
  let best: RiskLevel | null = null;
  let bestRank = Infinity;
  for (const clause of clauses) {
    const rank = riskRank(clause.riskLevel);
    if (rank < bestRank) {
      bestRank = rank;
      best = clause.riskLevel;
    }
  }
  return best;
}

/**
 * Deterministic priority order for "key financial figures" — a superset
 * spanning every contract type this app supports. Only concepts genuinely
 * present in THIS contract's own extracted data ever appear (an id simply
 * has nothing to contribute when the contract doesn't contain it), so this
 * single ordered list naturally adapts per contract type without a
 * type-specific branch. "duration" is a synthetic entry (not a concept id),
 * checked in its natural place among the other headline figures.
 */
const KEY_FIGURE_PRIORITY: readonly (CanonicalConceptId | "duration")[] = [
  "monthly_installment",
  "monthly_rent",
  "duration",
  "down_payment",
  "total_repayment",
  "final_payment",
  "financing_principal",
  "interest_rate",
  "salary",
  "credit_limit",
  "security_deposit",
  "insurance_premium",
  "minimum_payment",
  "annual_fee",
  "subscription_fee",
  "administrative_fee",
  "brokerage_fee",
];

const MAX_KEY_FIGURES = 5;
const MAX_FINDINGS = 5;

function buildKeyFinancialFigures(
  financialMetrics: FinancialMetrics | null,
  contractType: ContractType,
  language: AnalysisLanguage,
  unavailableLabel: string,
): Array<{ key: string; label: string; value: string }> {
  if (!financialMetrics) {
    return [];
  }

  const concepts = buildFinancialConcepts(financialMetrics, contractType);
  const conceptsById = new Map<CanonicalConceptId, FinancialConceptItem>();
  for (const item of concepts) {
    // First occurrence wins — concepts are already deduplicated upstream, so
    // this only matters for picking a stable one when (rarely) more than one
    // item resolves to the same concept id.
    if (!conceptsById.has(item.conceptId)) {
      conceptsById.set(item.conceptId, item);
    }
  }

  const durationFacts = buildDurationFacts(financialMetrics, concepts);
  const contractDurationFact = durationFacts.find((fact) => fact.kind === "contractDuration") ?? null;
  const durationCopy = FINANCIAL_METRICS_COPY[language].duration;

  const figures: Array<{ key: string; label: string; value: string }> = [];

  for (const candidate of KEY_FIGURE_PRIORITY) {
    if (figures.length >= MAX_KEY_FIGURES) {
      break;
    }

    if (candidate === "duration") {
      if (!contractDurationFact) continue;
      const formatted = formatContractDuration(financialMetrics.contractDuration, language, unavailableLabel, durationCopy);
      if (formatted.kind !== "value") continue;
      figures.push({ key: "duration", label: durationCopy.title, value: formatted.primaryText });
      continue;
    }

    const item = conceptsById.get(candidate);
    if (!item) continue;

    const label = getCanonicalConceptLabel(candidate, language);

    if (candidate === "interest_rate") {
      if (!item.percentage) continue;
      const formatted = formatPercentageMetric(item.percentage, language, unavailableLabel, PERCENT_SIGN[language]);
      if (formatted.kind !== "value") continue;
      figures.push({ key: candidate, label, value: formatted.text });
      continue;
    }

    const formatted = formatMoneyMetric(item.amount, language, unavailableLabel);
    if (formatted.kind !== "value") continue;
    figures.push({ key: candidate, label, value: formatted.text });
  }

  return figures;
}

/**
 * Keeps only the first sentence of an already-existing string — never
 * invents new wording, only cuts. A "Top Findings" entry showing a clause's
 * full 2-3 sentence AI summary reads like a clause-by-clause report excerpt,
 * not an executive-summary headline; one sentence is enough to convey what
 * the finding is, and keeps total reading time under about a minute.
 */
function firstSentence(text: string): string {
  const match = text.match(/^[\s\S]*?[.!?؟]/u);
  return (match ? match[0] : text).trim();
}

function buildImportantFindings(
  analysis: ContractAnalysisResult,
  financialMetrics: FinancialMetrics | null,
  contractType: ContractType,
  language: AnalysisLanguage,
): Array<{ title: string; summary: string; riskLevel?: RiskLevel | null }> {
  const clauses = deduplicateClauses(analysis.importantClauses)
    .map((clause) => {
      const fullSummary = sanitizeDisplayText(clause.summary) ?? sanitizeDisplayText(clause.plainExplanation) ?? "";
      return {
        title: sanitizeDisplayText(clause.title),
        summary: fullSummary ? firstSentence(fullSummary) : "",
        riskLevel: clause.riskLevel,
      };
    })
    .filter((clause): clause is { title: string; summary: string; riskLevel: RiskLevel | null } => clause.title !== null);

  const highRisk = clauses.filter((c) => c.riskLevel === "high");
  const mediumRisk = clauses.filter((c) => c.riskLevel === "medium");

  const findings: Array<{ title: string; summary: string; riskLevel?: RiskLevel | null }> = [...highRisk, ...mediumRisk];

  if (findings.length < MAX_FINDINGS && financialMetrics) {
    const concepts = buildFinancialConcepts(financialMetrics, contractType);
    const conditional = concepts
      .filter((item) => item.bucket === "conditional" && item.amount.value !== null)
      .sort((a, b) => (b.amount.value ?? 0) - (a.amount.value ?? 0));

    for (const item of conditional) {
      if (findings.length >= MAX_FINDINGS) break;
      const formatted = formatMoneyMetric(item.amount, language, "");
      if (formatted.kind !== "value") continue;
      const label = getCanonicalConceptLabel(item.conceptId, language);
      const triggerText = sanitizeDisplayText(item.trigger);
      findings.push({
        title: label,
        summary: triggerText ? firstSentence(triggerText) : formatted.text,
        riskLevel: null,
      });
    }
  }

  if (findings.length < MAX_FINDINGS && analysis.missingInformation.length > 0) {
    for (const missing of analysis.missingInformation) {
      if (findings.length >= MAX_FINDINGS) break;
      const reason = sanitizeDisplayText(missing.reason);
      if (!reason) continue;
      findings.push({ title: reason, summary: "", riskLevel: null });
    }
  }

  return findings.slice(0, MAX_FINDINGS);
}

function pickPersonalizedConclusion(session: PersonalizedAnalysisSessionState, language: AnalysisLanguage): string {
  const copy = REPORT_SUMMARY_COPY[language].pdf;
  const result = session.result;
  if (!result) {
    return copy.personalizedConclusionFallback;
  }
  const first = result.personalImpact[0] ?? result.thingsToWatch[0] ?? null;
  if (!first) {
    return copy.personalizedConclusionFallback;
  }
  const explanation = sanitizeDisplayText(first.explanation);
  return explanation ? firstSentence(explanation) : copy.personalizedConclusionFallback;
}

function buildPersonalizedSection(
  session: PersonalizedAnalysisSessionState,
  financialMetrics: FinancialMetrics | null,
  contractType: ContractType,
  language: AnalysisLanguage,
  unavailableLabel: string,
): ReportSummaryData["personalized"] | undefined {
  if (session.status !== "success" || !session.result || !session.budgetResult) {
    return undefined;
  }

  const currency = financialMetrics?.currency ?? null;
  const concepts = financialMetrics ? buildFinancialConcepts(financialMetrics, contractType) : [];
  const monthlyCommitment = selectApplicableMonthlyOutflow(concepts)?.value ?? null;

  const monthlyIncome = parseBudgetInputValue(session.form.monthlyIncome);
  const existingDebt = parseBudgetInputValue(session.form.existingDebt);
  const totalMonthlyObligations =
    existingDebt !== null && monthlyCommitment !== null ? existingDebt + monthlyCommitment : null;

  const percentSign = PERCENT_SIGN[language];

  return {
    monthlyIncome: formatMoneyMetric({ value: monthlyIncome, currency, reason: null }, language, unavailableLabel).text,
    existingMonthlyObligations: formatMoneyMetric({ value: existingDebt, currency, reason: null }, language, unavailableLabel).text,
    newContractCommitment: formatMoneyMetric({ value: monthlyCommitment, currency, reason: null }, language, unavailableLabel).text,
    totalMonthlyObligations: formatMoneyMetric({ value: totalMonthlyObligations, currency, reason: null }, language, unavailableLabel).text,
    obligationToIncomeRatio: formatPercentageMetric(
      { value: session.budgetResult.totalCommitmentRatio, reason: null },
      language,
      unavailableLabel,
      percentSign,
    ).text,
    remainingMonthlyAmount: formatMoneyMetric(
      { value: session.budgetResult.availableAfterContract, currency, reason: null },
      language,
      unavailableLabel,
    ).text,
    conclusion: pickPersonalizedConclusion(session, language),
  };
}

export interface BuildReportSummaryDataInput {
  language: AnalysisLanguage;
  analysis: ContractAnalysisResult;
  financialMetrics: FinancialMetrics | null;
  /** Whether Option B (summary + personalized analysis) was chosen. Ignored (treated as false) if the personalized session isn't actually complete. */
  includePersonalized: boolean;
  personalizedSession: PersonalizedAnalysisSessionState;
  /** Injectable for deterministic tests; defaults to `new Date()`. */
  now?: Date;
}

/**
 * Pure, UI-independent builder — reads only from already-computed results
 * (contract analysis, financial metrics, the lifted personalized-analysis
 * session state). Never accesses React, never makes a network call, never
 * invents a value: every field is either a real formatted value or omitted/
 * marked unavailable using the same "never a fake zero" formatters the rest
 * of the app already uses.
 */
export function buildReportSummaryData(input: BuildReportSummaryDataInput): ReportSummaryData {
  const { language, analysis, financialMetrics, includePersonalized, personalizedSession } = input;
  const copy = REPORT_SUMMARY_COPY[language].pdf;
  const now = input.now ?? new Date();

  const clauses = deduplicateClauses(analysis.importantClauses);
  const overallRisk = worstRiskLevel(clauses);

  const durationCopy = FINANCIAL_METRICS_COPY[language].duration;
  const durationText = financialMetrics
    ? (() => {
        const formatted = formatContractDuration(financialMetrics.contractDuration, language, copy.unavailable, durationCopy);
        return formatted.kind === "value" ? formatted.primaryText : null;
      })()
    : null;

  const importantFindings = buildImportantFindings(analysis, financialMetrics, analysis.contractType, language);
  const highRiskCount = importantFindings.filter((f) => f.riskLevel === "high").length;
  const titleParts = buildContractTitleParts(analysis, language);

  const data: ReportSummaryData = {
    language,
    generatedAt: now.toISOString(),
    contract: {
      title: buildContractTitleText(analysis, language),
      typeLabel: titleParts.typeLabel,
      overallRisk,
      duration: durationText,
    },
    keyFinancialFigures: buildKeyFinancialFigures(financialMetrics, analysis.contractType, language, copy.unavailable),
    importantFindings,
    conclusion: copy.contractOnlyConclusion(importantFindings.length, highRiskCount),
  };

  const canIncludePersonalized = includePersonalized && personalizedSession.status === "success" && personalizedSession.result !== null;
  if (canIncludePersonalized) {
    data.personalized = buildPersonalizedSection(personalizedSession, financialMetrics, analysis.contractType, language, copy.unavailable);
  }

  return data;
}

/** True once a completed personalized-analysis result exists — mirrors `hasCompletedPersonalizedAnalysis` from the session hook, re-exported here for callers that only import from this module. */
export function canIncludePersonalizedInReport(session: PersonalizedAnalysisSessionState): boolean {
  return session.status === "success" && session.result !== null;
}
