import { useRef, useState } from "react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult } from "@/types/analysis";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { formatMoneyMetric, type MoneyMetricLike } from "@/lib/financialFormatters";
import { calculateBudgetImpact, hasMinimumBudgetInputs, parseBudgetInputValue } from "@/lib/budgetImpact";
import { buildFinancialConcepts, selectApplicableMonthlyOutflow, selectApplicableUpfrontLiquidity } from "@/lib/financialConcepts";
import { fetchPersonalizedAnalysis } from "@/lib/personalizedAnalysisApi";
import type { PersonalizedAnalysisSession } from "@/hooks/usePersonalizedAnalysisSession";
import Accordion from "./shared/Accordion";
import PersonalizedAnalysisSection from "./PersonalizedAnalysisSection";

const PERCENT_SIGN: Record<AnalysisLanguage, string> = { ar: "٪", en: "%" };

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

export default function FinancialAnalysisTab({
  analysis,
  financialMetrics,
  language,
  session,
}: {
  analysis: ContractAnalysisResult;
  financialMetrics: FinancialMetrics | null;
  language: AnalysisLanguage;
  /** Durable personalized-analysis session state, owned by the nearest parent that survives result-tab switches — see `usePersonalizedAnalysisSession`. */
  session: PersonalizedAnalysisSession;
}) {
  const copy = RESULTS_COPY[language];
  const form = session.state.form;
  const result = session.state.budgetResult;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["budgetImpact"]));
  // Synchronous guard against a duplicate in-flight personalized-analysis
  // request — e.g. a fast double-click on "Retry", or any rerender/tab
  // switch that might otherwise re-invoke the submit/retry handler while a
  // previous request is still pending. `session.state.status === "loading"`
  // alone isn't enough since it updates via React state (not synchronous
  // with the click that triggers it) — same rationale as ContractChat's
  // `requestInFlightRef`.
  const requestInFlightRef = useRef(false);

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const concepts = financialMetrics ? buildFinancialConcepts(financialMetrics, analysis.contractType) : [];
  const currency = financialMetrics?.currency ?? null;
  const applicableMonthlyOutflow = selectApplicableMonthlyOutflow(concepts);
  const applicableUpfrontLiquidity = selectApplicableUpfrontLiquidity(concepts);
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

  /**
   * Fires the actual personalized-analysis request against an already-set
   * budget result. Shared by the initial submission and the retry button —
   * guarded by `requestInFlightRef` so neither path can ever start a second
   * request while one is still pending.
   */
  function runPersonalizedAnalysis(budgetResult: NonNullable<typeof result>) {
    if (requestInFlightRef.current) {
      return;
    }
    // `handleSubmit`'s null-check on these doesn't narrow them here — they're
    // read as closures over the outer component scope, not through the call
    // site — so they're re-checked directly in this function's own scope.
    if (monthlyIncome === null || essentialExpenses === null || existingDebt === null) {
      return;
    }
    requestInFlightRef.current = true;

    session.startPersonalizedAnalysis();
    fetchPersonalizedAnalysis({
      language,
      analysis,
      concepts,
      currency,
      applicableMonthlyOutflow: monthlyCommitment,
      applicableUpfrontLiquidity: upfrontCosts,
      budgetInputs: { monthlyIncome, essentialExpenses, existingMonthlyDebt: existingDebt, savings },
      availableBeforeContract: budgetResult.availableBeforeContract,
      availableAfterContract: budgetResult.availableAfterContract,
      contractIncomeRatio: budgetResult.contractIncomeRatio,
      totalCommitmentRatio: budgetResult.totalCommitmentRatio,
      remainingSavings: budgetResult.remainingSavings,
      emergencyCoverageMonths: budgetResult.emergencyCoverageMonths,
    }).then((outcome) => {
      requestInFlightRef.current = false;
      if (outcome.success) {
        session.setPersonalizedAnalysisResult(outcome.data);
      } else {
        session.setPersonalizedAnalysisUnavailable();
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || monthlyIncome === null || essentialExpenses === null || existingDebt === null) return;

    const budgetResult = calculateBudgetImpact(
      { monthlyIncome, essentialExpenses, existingMonthlyDebt: existingDebt, savings },
      { monthlyCommitment, upfrontCosts },
    );
    session.setBudgetResult(budgetResult);

    // Runs exactly once per real submission — never re-triggered merely by
    // this component remounting when the user returns to this tab (see
    // usePersonalizedAnalysisSession's doc comment).
    runPersonalizedAnalysis(budgetResult);
  }

  function handleRetryPersonalizedAnalysis() {
    if (!result) {
      return;
    }
    runPersonalizedAnalysis(result);
  }

  function handleEdit() {
    session.resetBudgetResult();
  }

  if (!result) {
    return (
      <div dir={language === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">{copy.financialAnalysis.introTitle}</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{copy.financialAnalysis.introBody}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="budget-impact-form">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{copy.financialAnalysis.form.monthlyIncome}</span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              data-testid="input-monthly-income"
              value={form.monthlyIncome}
              onChange={(e) => { const value = e.target.value; session.setForm((f) => ({ ...f, monthlyIncome: value })); }}
              className="h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-[14px] outline-none focus:border-indigo-400"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{copy.financialAnalysis.form.essentialExpenses}</span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              data-testid="input-essential-expenses"
              value={form.essentialExpenses}
              onChange={(e) => { const value = e.target.value; session.setForm((f) => ({ ...f, essentialExpenses: value })); }}
              className="h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-[14px] outline-none focus:border-indigo-400"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{copy.financialAnalysis.form.existingDebt}</span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              data-testid="input-existing-debt"
              value={form.existingDebt}
              onChange={(e) => { const value = e.target.value; session.setForm((f) => ({ ...f, existingDebt: value })); }}
              className="h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-[14px] outline-none focus:border-indigo-400"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              {copy.financialAnalysis.form.savings} <span className="text-white/30">({copy.financialAnalysis.form.savingsOptional})</span>
            </span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              data-testid="input-savings"
              value={form.savings}
              onChange={(e) => { const value = e.target.value; session.setForm((f) => ({ ...f, savings: value })); }}
              className="h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-[14px] outline-none focus:border-indigo-400"
            />
          </label>

          {!canSubmit && (form.monthlyIncome || form.essentialExpenses || form.existingDebt) && (
            <p className="text-[12px] text-amber-400" data-testid="budget-form-incomplete">
              {copy.financialAnalysis.form.incomplete}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            data-testid="button-submit-budget-impact"
            className="h-12 rounded-full bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] text-white font-bold disabled:opacity-40 disabled:pointer-events-none"
          >
            {copy.financialAnalysis.form.submit}
          </button>
        </form>
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

  return (
    <div dir={language === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-3">
      <div className="flex items-center justify-end -mb-1">
        <button onClick={handleEdit} data-testid="button-edit-budget-inputs" className="text-xs font-semibold text-indigo-400">
          {copy.financialAnalysis.editInputs}
        </button>
      </div>

      <Accordion
        title={budgetImpactCopy.title}
        expanded={expandedSections.has("budgetImpact")}
        onToggle={() => toggleSection("budgetImpact")}
        testId="financial-analysis-budget-impact"
      >
        <div className="flex flex-col gap-2.5" data-testid="budget-impact-rows">
          {beforeText && (
            <div className="flex items-center justify-between gap-3" data-testid="row-remaining-before">
              <span className="text-[12px] text-muted-foreground">{budgetImpactCopy.remainingBeforeLabel}</span>
              <span className="text-[14px] font-bold text-white">{beforeText}</span>
            </div>
          )}
          {afterText && (
            <div className="flex items-center justify-between gap-3" data-testid="row-remaining-after">
              <span className="text-[12px] text-muted-foreground">{budgetImpactCopy.remainingAfterLabel}</span>
              <span className="text-[14px] font-bold text-white">{afterText}</span>
            </div>
          )}
          {contractIncomeRatioText && (
            <div className="flex items-center justify-between gap-3" data-testid="row-contract-income-ratio">
              <span className="text-[12px] text-muted-foreground">{budgetImpactCopy.contractIncomeRatioLabel}</span>
              <span className="text-[14px] font-bold text-white">{contractIncomeRatioText}</span>
            </div>
          )}
          {totalCommitmentRatioText && (
            <div className="flex items-center justify-between gap-3" data-testid="row-total-commitment-ratio">
              <span className="text-[12px] text-muted-foreground">{budgetImpactCopy.totalCommitmentRatioLabel}</span>
              <span className="text-[14px] font-bold text-white">{totalCommitmentRatioText}</span>
            </div>
          )}
          {savingsBeforeText && savingsAfterText && (
            <div className="flex items-center justify-between gap-3" data-testid="row-savings">
              <span className="text-[12px] text-muted-foreground">{budgetImpactCopy.savingsLabel}</span>
              <span className="text-[14px] font-bold text-white">
                {savingsBeforeText} → {savingsAfterText}
              </span>
            </div>
          )}
        </div>
      </Accordion>

      <PersonalizedAnalysisSection
        language={language}
        status={session.state.status}
        data={session.state.result}
        onRetry={handleRetryPersonalizedAnalysis}
      />
    </div>
  );
}
