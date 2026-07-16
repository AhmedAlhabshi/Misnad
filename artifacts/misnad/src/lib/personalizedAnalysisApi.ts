import type { AnalysisLanguage } from "@workspace/contract-types";
import type { ContractAnalysisResult } from "@/types/analysis";
import type { FinancialConceptItem } from "@/lib/financialConcepts";
import { getCanonicalConceptLabel } from "@/lib/financialMetricsCopy";
import { sanitizeDisplayText } from "@/lib/textSanitization";
import { deduplicateClauses } from "@/lib/clauseDedup";

export interface PersonalizedAnalysisInsightItem {
  title: string;
  explanation: string;
  basis: string;
}

export interface PersonalizedAnalysisBeforeYouSignItem {
  type: "advice" | "question";
  title: string;
  text: string;
  basis: string;
}

export interface PersonalizedAnalysisResponse {
  personalImpact: PersonalizedAnalysisInsightItem[];
  thingsToWatch: PersonalizedAnalysisInsightItem[];
  beforeYouSign: PersonalizedAnalysisBeforeYouSignItem[];
}

export interface PersonalizedAnalysisBudgetInputs {
  monthlyIncome: number;
  essentialExpenses: number;
  existingMonthlyDebt: number;
  /** Optional per the spec — `null` when the user chose not to enter it. */
  savings: number | null;
}

export interface PersonalizedAnalysisRequestInput {
  language: AnalysisLanguage;
  analysis: ContractAnalysisResult;
  concepts: readonly FinancialConceptItem[];
  currency: string | null;
  applicableMonthlyOutflow: number | null;
  applicableUpfrontLiquidity: number | null;
  budgetInputs: PersonalizedAnalysisBudgetInputs;
  availableBeforeContract: number;
  availableAfterContract: number | null;
  contractIncomeRatio: number | null;
  totalCommitmentRatio: number | null;
  remainingSavings: number | null;
  emergencyCoverageMonths: number | null;
}

function isWellFormedPersonalizedAnalysisResponse(body: unknown): body is { success: boolean; analysis?: unknown } {
  return typeof body === "object" && body !== null && "success" in body;
}

/**
 * Guards against a stale/previous-schema response (e.g. an old-schema
 * `{pressurePoints, positiveFactors, discussionPoints}` payload served by a
 * backend that hasn't picked up the current schema) actually reaching the
 * UI. Without this check, `body.analysis` could exist as an object but lack
 * `personalImpact`/`thingsToWatch`/`beforeYouSign` as arrays, which crashed
 * rendering at `items.length`. A malformed shape is treated exactly like a
 * failed request — never partially rendered, never backfilled with fake data.
 */
function isPersonalizedAnalysisResponseShape(value: unknown): value is PersonalizedAnalysisResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.personalImpact) && Array.isArray(candidate.thingsToWatch) && Array.isArray(candidate.beforeYouSign);
}

function buildClausePayload(analysis: ContractAnalysisResult) {
  const deduped = deduplicateClauses(analysis.importantClauses);
  return deduped
    .slice(0, 20)
    .map((clause) => {
      const title = sanitizeDisplayText(clause.title);
      if (!title) {
        return null;
      }
      return {
        title,
        summary: sanitizeDisplayText(clause.summary) ?? "",
        plainExplanation: sanitizeDisplayText(clause.plainExplanation) ?? "",
        riskLevel: clause.riskLevel,
      };
    })
    .filter((clause): clause is NonNullable<typeof clause> => clause !== null);
}

function buildConceptsPayload(concepts: readonly FinancialConceptItem[], language: AnalysisLanguage) {
  return concepts.slice(0, 40).map((item) => ({
    conceptId: item.conceptId,
    label: item.conceptId === "other" ? (sanitizeDisplayText(item.label) ?? "other") : getCanonicalConceptLabel(item.conceptId, language),
    amount: item.amount.value,
    currency: item.amount.currency,
    frequency: item.frequency,
    role: item.financialRole,
    bucket: item.bucket,
    mandatory: item.mandatory,
    conditional: item.conditional,
    refundable: item.refundable,
    trigger: sanitizeDisplayText(item.trigger),
  }));
}

/**
 * Performs the Personalized Financial Analysis request (sections 2-4 of the
 * Financial Analysis tab): combines the deterministic budget metrics, the
 * classified contract financial concepts, and the actual extracted clauses
 * into a single sanitized request to `/api/analyze-financial-impact`.
 *
 * Never throws — returns a discriminated result instead, so callers can
 * update UI state without a try/catch. Never logs the request payload or
 * response (the user's financial inputs travel only in this one request
 * body to the first-party backend, never to `console.*` or any diagnostic).
 */
export async function fetchPersonalizedAnalysis(
  input: PersonalizedAnalysisRequestInput,
): Promise<{ success: true; data: PersonalizedAnalysisResponse } | { success: false }> {
  try {
    const payload = {
      analysisLanguage: input.language,
      contractType: input.analysis.contractType,
      contractSummary: sanitizeDisplayText(input.analysis.contractSummary) ?? "",
      clauses: buildClausePayload(input.analysis),
      financialConcepts: buildConceptsPayload(input.concepts, input.language),
      budgetMetrics: {
        monthlyIncome: input.budgetInputs.monthlyIncome,
        essentialExpenses: input.budgetInputs.essentialExpenses,
        existingMonthlyDebt: input.budgetInputs.existingMonthlyDebt,
        savings: input.budgetInputs.savings,
        currency: input.currency,
        applicableMonthlyOutflow: input.applicableMonthlyOutflow,
        applicableUpfrontLiquidity: input.applicableUpfrontLiquidity,
        availableBeforeContract: input.availableBeforeContract,
        availableAfterContract: input.availableAfterContract,
        contractIncomeRatio: input.contractIncomeRatio,
        totalCommitmentRatio: input.totalCommitmentRatio,
        remainingSavings: input.remainingSavings,
        emergencyCoverageMonths: input.emergencyCoverageMonths,
      },
    };

    const res = await fetch("/api/analyze-financial-impact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body: unknown = await res.json().catch(() => null);

    if (
      !isWellFormedPersonalizedAnalysisResponse(body) ||
      !res.ok ||
      !body.success ||
      !body.analysis ||
      !isPersonalizedAnalysisResponseShape(body.analysis)
    ) {
      return { success: false };
    }

    return { success: true, data: body.analysis };
  } catch {
    return { success: false };
  }
}
