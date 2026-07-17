import { useEffect, useState, type FormEvent } from "react";
import { HelpCircle, Lightbulb } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult } from "@/types/analysis";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { formatMoneyMetric, type MoneyMetricLike } from "@/lib/financialFormatters";
import { calculateBudgetImpact, hasMinimumBudgetInputs, parseBudgetInputValue, type BudgetImpactResult } from "@/lib/budgetImpact";
import {
  buildFinancialConcepts,
  selectApplicableMonthlyOutflow,
  selectApplicableUpfrontLiquidity,
  type FinancialConceptItem,
} from "@/lib/financialConcepts";
import { getCanonicalConceptLabel } from "@/lib/financialMetricsCopy";
import { sanitizeDisplayText } from "@/lib/textSanitization";
import { deduplicateClauses } from "@/lib/clauseDedup";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { V2_COPY } from "../../copy";
import SectionCard from "../ui/SectionCard";

const PERCENT_SIGN: Record<AnalysisLanguage, string> = { ar: "٪", en: "%" };

interface FormState {
  monthlyIncome: string;
  essentialExpenses: string;
  existingDebt: string;
  savings: string;
}

const EMPTY_FORM: FormState = { monthlyIncome: "", essentialExpenses: "", existingDebt: "", savings: "" };

interface InsightItem {
  title: string;
  explanation: string;
  basis: string;
}

interface BeforeYouSignItem {
  type: "advice" | "question";
  title: string;
  text: string;
  basis: string;
}

interface PersonalizedAnalysisResponse {
  personalImpact: InsightItem[];
  thingsToWatch: InsightItem[];
  beforeYouSign: BeforeYouSignItem[];
}

type InsightsState = "loading" | "success" | "unavailable";

function moneyText(value: number | null, currency: string | null, language: AnalysisLanguage): string | null {
  if (value === null) return null;
  const metric: MoneyMetricLike = { value, currency, reason: null };
  const formatted = formatMoneyMetric(metric, language, "");
  return formatted.kind === "value" ? formatted.text : null;
}

function percentText(value: number | null, language: AnalysisLanguage): string | null {
  if (value === null) return null;
  const rounded = Math.round(value * 10) / 10;
  const locale = language === "ar" ? "ar-SA" : "en-US";
  const text = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, numberingSystem: "latn" }).format(rounded);
  return `${text}${PERCENT_SIGN[language]}`;
}

function isWellFormedPersonalizedAnalysisResponse(body: unknown): body is { success: boolean; analysis?: unknown } {
  return typeof body === "object" && body !== null && "success" in body;
}

function isPersonalizedAnalysisResponseShape(value: unknown): value is PersonalizedAnalysisResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.personalImpact) && Array.isArray(candidate.thingsToWatch) && Array.isArray(candidate.beforeYouSign);
}

function buildClausePayload(analysis: ContractAnalysisResult) {
  return deduplicateClauses(analysis.importantClauses)
    .slice(0, 20)
    .map((clause) => {
      const title = sanitizeDisplayText(clause.title);
      if (!title) return null;
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
 * Combines V1's `FinancialAnalysisTab` (deterministic budget-impact form
 * and math) and `PersonalizedAnalysisSection` (the AI-interpreted,
 * grounded 3-section insight request) into one V2 section, matching the
 * brief's single "Personalized Financial Insights" item — same network
 * call, same request payload, same strict response-shape validation.
 */
export default function PersonalizedInsightsSection({
  analysis,
  financialMetrics,
  language,
}: {
  analysis: ContractAnalysisResult;
  financialMetrics: FinancialMetrics | null;
  language: AnalysisLanguage;
}) {
  const copy = RESULTS_COPY[language];
  const v2Copy = V2_COPY[language];
  const isAr = language === "ar";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [result, setResult] = useState<BudgetImpactResult | null>(null);
  const [insightsState, setInsightsState] = useState<InsightsState>("loading");
  const [insightsData, setInsightsData] = useState<PersonalizedAnalysisResponse | null>(null);

  const concepts = financialMetrics ? buildFinancialConcepts(financialMetrics, analysis.contractType) : [];
  const currency = financialMetrics?.currency ?? null;
  const applicableMonthlyOutflow = selectApplicableMonthlyOutflow(concepts);
  const applicableUpfrontLiquidity = selectApplicableUpfrontLiquidity(concepts, analysis.contractType);
  const monthlyCommitment = applicableMonthlyOutflow?.value ?? null;
  const upfrontCosts = applicableUpfrontLiquidity?.value ?? null;

  const monthlyIncome = parseBudgetInputValue(form.monthlyIncome);
  const essentialExpenses = parseBudgetInputValue(form.essentialExpenses);
  const existingDebt = parseBudgetInputValue(form.existingDebt);
  const savings = parseBudgetInputValue(form.savings);

  const canSubmit = hasMinimumBudgetInputs({
    monthlyIncome: monthlyIncome ?? undefined,
    essentialExpenses: essentialExpenses ?? undefined,
    existingMonthlyDebt: existingDebt ?? undefined,
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || monthlyIncome === null || essentialExpenses === null || existingDebt === null) return;
    setResult(calculateBudgetImpact({ monthlyIncome, essentialExpenses, existingMonthlyDebt: existingDebt, savings }, { monthlyCommitment, upfrontCosts }));
  }

  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    setInsightsState("loading");
    setInsightsData(null);

    async function run() {
      try {
        const payload = {
          analysisLanguage: language,
          contractType: analysis.contractType,
          contractSummary: sanitizeDisplayText(analysis.contractSummary) ?? "",
          clauses: buildClausePayload(analysis),
          financialConcepts: buildConceptsPayload(concepts, language),
          budgetMetrics: {
            monthlyIncome,
            essentialExpenses,
            existingMonthlyDebt: existingDebt,
            savings,
            currency,
            applicableMonthlyOutflow: monthlyCommitment,
            applicableUpfrontLiquidity: upfrontCosts,
            availableBeforeContract: result!.availableBeforeContract,
            availableAfterContract: result!.availableAfterContract,
            contractIncomeRatio: result!.contractIncomeRatio,
            totalCommitmentRatio: result!.totalCommitmentRatio,
            remainingSavings: result!.remainingSavings,
            emergencyCoverageMonths: result!.emergencyFundCoverageMonths,
          },
        };

        const res = await fetch("/api/analyze-financial-impact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body: unknown = await res.json().catch(() => null);

        if (!isWellFormedPersonalizedAnalysisResponse(body) || !res.ok || !body.success || !body.analysis || !isPersonalizedAnalysisResponseShape(body.analysis)) {
          throw new Error("Personalized analysis request failed.");
        }
        if (cancelled) return;
        setInsightsData(body.analysis);
        setInsightsState("success");
      } catch {
        if (cancelled) return;
        setInsightsState("unavailable");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  if (!result) {
    return (
      <div dir={isAr ? "rtl" : "ltr"} className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">{v2Copy.insights.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.financialAnalysis.introBody}</p>
        </div>
        <SectionCard testId="budget-impact-form">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{copy.financialAnalysis.form.monthlyIncome}</span>
              <Input
                type="number"
                min="0"
                inputMode="decimal"
                data-testid="input-monthly-income"
                value={form.monthlyIncome}
                onChange={(e) => setForm((f) => ({ ...f, monthlyIncome: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{copy.financialAnalysis.form.essentialExpenses}</span>
              <Input
                type="number"
                min="0"
                inputMode="decimal"
                data-testid="input-essential-expenses"
                value={form.essentialExpenses}
                onChange={(e) => setForm((f) => ({ ...f, essentialExpenses: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{copy.financialAnalysis.form.existingDebt}</span>
              <Input
                type="number"
                min="0"
                inputMode="decimal"
                data-testid="input-existing-debt"
                value={form.existingDebt}
                onChange={(e) => setForm((f) => ({ ...f, existingDebt: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {copy.financialAnalysis.form.savings} <span className="text-muted-foreground/70">({copy.financialAnalysis.form.savingsOptional})</span>
              </span>
              <Input
                type="number"
                min="0"
                inputMode="decimal"
                data-testid="input-savings"
                value={form.savings}
                onChange={(e) => setForm((f) => ({ ...f, savings: e.target.value }))}
              />
            </label>
            {!canSubmit && (form.monthlyIncome || form.essentialExpenses || form.existingDebt) && (
              <p className="text-xs text-v2-warning-foreground" data-testid="budget-form-incomplete">
                {copy.financialAnalysis.form.incomplete}
              </p>
            )}
            <Button type="submit" disabled={!canSubmit} data-testid="button-submit-budget-impact" size="lg" className="font-semibold">
              {copy.financialAnalysis.form.submit}
            </Button>
          </form>
        </SectionCard>
      </div>
    );
  }

  const beforeText = moneyText(result.availableBeforeContract, currency, language);
  const afterText = result.availableAfterContract !== null ? moneyText(result.availableAfterContract, currency, language) : null;
  const contractIncomeRatioText = percentText(result.contractIncomeRatio, language);
  const totalCommitmentRatioText = percentText(result.totalCommitmentRatio, language);
  const savingsBeforeText = savings !== null ? moneyText(savings, currency, language) : null;
  const savingsAfterText = result.remainingSavings !== null ? moneyText(result.remainingSavings, currency, language) : null;
  const budgetImpactCopy = copy.financialAnalysis.budgetImpact;
  const insightsCopy = copy.financialAnalysis.personalizedAnalysis;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">{v2Copy.insights.title}</h2>
        <Button variant="ghost" size="sm" onClick={() => setResult(null)} data-testid="button-edit-budget-inputs">
          {copy.financialAnalysis.editInputs}
        </Button>
      </div>

      <SectionCard title={budgetImpactCopy.title} testId="financial-analysis-budget-impact">
        <div className="flex flex-col gap-2.5" data-testid="budget-impact-rows">
          {beforeText && (
            <div className="flex items-center justify-between gap-3" data-testid="row-remaining-before">
              <span className="text-sm text-muted-foreground">{budgetImpactCopy.remainingBeforeLabel}</span>
              <span className="text-sm font-bold text-foreground">{beforeText}</span>
            </div>
          )}
          {afterText && (
            <div className="flex items-center justify-between gap-3" data-testid="row-remaining-after">
              <span className="text-sm text-muted-foreground">{budgetImpactCopy.remainingAfterLabel}</span>
              <span className="text-sm font-bold text-foreground">{afterText}</span>
            </div>
          )}
          {contractIncomeRatioText && (
            <div className="flex items-center justify-between gap-3" data-testid="row-contract-income-ratio">
              <span className="text-sm text-muted-foreground">{budgetImpactCopy.contractIncomeRatioLabel}</span>
              <span className="text-sm font-bold text-foreground">{contractIncomeRatioText}</span>
            </div>
          )}
          {totalCommitmentRatioText && (
            <div className="flex items-center justify-between gap-3" data-testid="row-total-commitment-ratio">
              <span className="text-sm text-muted-foreground">{budgetImpactCopy.totalCommitmentRatioLabel}</span>
              <span className="text-sm font-bold text-foreground">{totalCommitmentRatioText}</span>
            </div>
          )}
          {savingsBeforeText && savingsAfterText && (
            <div className="flex items-center justify-between gap-3" data-testid="row-savings">
              <span className="text-sm text-muted-foreground">{budgetImpactCopy.savingsLabel}</span>
              <span className="text-sm font-bold text-foreground">
                {savingsBeforeText} → {savingsAfterText}
              </span>
            </div>
          )}
        </div>
      </SectionCard>

      {insightsState === "loading" && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center" data-testid="personalized-analysis-loading">
          <p className="text-sm text-muted-foreground">{insightsCopy.loading}</p>
        </div>
      )}

      {insightsState === "unavailable" && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center" data-testid="personalized-analysis-unavailable">
          <p className="text-sm text-muted-foreground">{insightsCopy.unavailable}</p>
        </div>
      )}

      {insightsState === "success" && insightsData && (
        <div className="flex flex-col gap-4" data-testid="personalized-analysis-section">
          {(
            [
              { key: "personalImpact", title: insightsCopy.personalImpactTitle, items: insightsData.personalImpact },
              { key: "thingsToWatch", title: insightsCopy.thingsToWatchTitle, items: insightsData.thingsToWatch },
            ] as const
          ).map(({ key, title, items }) =>
            items.length === 0 ? null : (
              <SectionCard key={key} title={title} testId={`personalized-analysis-${key}`}>
                <div className="flex flex-col gap-3">
                  {items.map((item, index) => (
                    <div key={index} className="border-b border-border pb-3 last:border-0 last:pb-0">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.explanation}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            ),
          )}

          {insightsData.beforeYouSign.length > 0 && (
            <SectionCard title={insightsCopy.beforeYouSignTitle} testId="personalized-analysis-beforeYouSign">
              <div className="flex flex-col gap-3">
                {insightsData.beforeYouSign.map((item, index) => {
                  const isQuestion = item.type === "question";
                  const Icon = isQuestion ? HelpCircle : Lightbulb;
                  const badgeLabel = isQuestion ? insightsCopy.questionLabel : insightsCopy.adviceLabel;
                  return (
                    <div key={index} className="border-b border-border pb-3 last:border-0 last:pb-0">
                      <div className="mb-1 flex items-center gap-1.5">
                        <Icon size={13} className={isQuestion ? "text-v2-info" : "text-v2-success"} />
                        <span className={`text-[11px] font-semibold uppercase tracking-wide ${isQuestion ? "text-v2-info" : "text-v2-success"}`}>
                          {badgeLabel}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}
