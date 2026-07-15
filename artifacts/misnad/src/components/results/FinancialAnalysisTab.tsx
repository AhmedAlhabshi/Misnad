import { useState } from "react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult } from "@/types/analysis";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { formatMoneyMetric, type MoneyMetricLike } from "@/lib/financialFormatters";
import { calculateBudgetImpact, hasMinimumBudgetInputs, parseBudgetInputValue, type BudgetImpactResult } from "@/lib/budgetImpact";
import { buildFinancialConcepts, selectApplicableMonthlyOutflow, selectApplicableUpfrontLiquidity } from "@/lib/financialConcepts";
import Accordion from "./shared/Accordion";
import PersonalizedAnalysisSection from "./PersonalizedAnalysisSection";

const PERCENT_SIGN: Record<AnalysisLanguage, string> = { ar: "٪", en: "%" };

interface FormState {
  monthlyIncome: string;
  essentialExpenses: string;
  existingDebt: string;
  savings: string;
}

const EMPTY_FORM: FormState = { monthlyIncome: "", essentialExpenses: "", existingDebt: "", savings: "" };

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
}: {
  analysis: ContractAnalysisResult;
  financialMetrics: FinancialMetrics | null;
  language: AnalysisLanguage;
}) {
  const copy = RESULTS_COPY[language];
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [result, setResult] = useState<BudgetImpactResult | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["budgetImpact"]));

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || monthlyIncome === null || essentialExpenses === null || existingDebt === null) return;
    setResult(
      calculateBudgetImpact(
        { monthlyIncome, essentialExpenses, existingMonthlyDebt: existingDebt, savings },
        { monthlyCommitment, upfrontCosts },
      ),
    );
  }

  function handleEdit() {
    setResult(null);
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
              onChange={(e) => setForm((f) => ({ ...f, monthlyIncome: e.target.value }))}
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
              onChange={(e) => setForm((f) => ({ ...f, essentialExpenses: e.target.value }))}
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
              onChange={(e) => setForm((f) => ({ ...f, existingDebt: e.target.value }))}
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
              onChange={(e) => setForm((f) => ({ ...f, savings: e.target.value }))}
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
        analysis={analysis}
        concepts={concepts}
        currency={currency}
        applicableMonthlyOutflow={applicableMonthlyOutflow?.value ?? null}
        applicableUpfrontLiquidity={applicableUpfrontLiquidity?.value ?? null}
        budgetInputs={{
          monthlyIncome: monthlyIncome as number,
          essentialExpenses: essentialExpenses as number,
          existingMonthlyDebt: existingDebt as number,
          savings,
        }}
        availableBeforeContract={result.availableBeforeContract}
        availableAfterContract={result.availableAfterContract}
        contractIncomeRatio={result.contractIncomeRatio}
        totalCommitmentRatio={result.totalCommitmentRatio}
        remainingSavings={result.remainingSavings}
        emergencyCoverageMonths={result.emergencyCoverageMonths}
      />
    </div>
  );
}
