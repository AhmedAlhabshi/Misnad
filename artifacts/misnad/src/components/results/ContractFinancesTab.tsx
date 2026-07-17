import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Landmark, Receipt, ShieldAlert } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult } from "@/types/analysis";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { FINANCIAL_METRICS_COPY, getCanonicalConceptLabel } from "@/lib/financialMetricsCopy";
import { formatMoneyMetric, formatPercentageMetric, formatCount } from "@/lib/financialFormatters";
import {
  buildDurationFacts,
  buildFinancialConcepts,
  groupContractFinancialConcepts,
  groupEmploymentFinancialConcepts,
  isStatedCapText,
  type ContractFinancialGroup,
  type DurationFact,
  type EmploymentFinancialGroup,
  type FinancialConceptItem,
} from "@/lib/financialConcepts";
import { sanitizeDisplayText } from "@/lib/textSanitization";

const PERCENT_SIGN: Record<AnalysisLanguage, string> = { ar: "٪", en: "%" };

/** Rendering order for the semantic groups — a group is skipped entirely when it has no facts. */
const GROUP_ORDER: ContractFinancialGroup[] = [
  "whatYoullPay",
  "feesAndCosts",
  "conditionalAmounts",
  "financingAndCredit",
  "ratesAndPercentages",
  "otherStatedAmounts",
];

/**
 * Employment's own 5-group order — completely separate from `GROUP_ORDER`
 * above, which never runs for `contractType === "employment"` (see
 * `resolveEmploymentFinancialGroup` in `financialConcepts.ts`). An
 * employment contract's money is income, never a cost, so it gets its own
 * framing end-to-end instead of reusing "what you'll pay"/"fees and costs".
 */
const EMPLOYMENT_GROUP_ORDER: EmploymentFinancialGroup[] = [
  "whatYouWillReceive",
  "compensationBreakdown",
  "conditionalOrNonGuaranteed",
  "potentialDeductions",
  "otherBenefits",
];

function GroupAccordion({
  title,
  expanded,
  onToggle,
  testId,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden" data-testid={testId}>
      <button
        onClick={onToggle}
        data-testid={`${testId}-toggle`}
        className="w-full flex items-center justify-between gap-3 p-4 text-start"
      >
        <span className="text-[14px] font-semibold text-white">{title}</span>
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} className="inline-flex shrink-0 text-muted-foreground">
          <ChevronDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 flex flex-col gap-2 text-start">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ContractFinancesTab({
  analysis,
  financialMetrics,
  language,
}: {
  analysis: ContractAnalysisResult;
  financialMetrics: FinancialMetrics | null;
  language: AnalysisLanguage;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const copy = RESULTS_COPY[language];
  const metricsCopy = FINANCIAL_METRICS_COPY[language];
  const percentSign = PERCENT_SIGN[language];

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (!financialMetrics) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center" data-testid="finances-unavailable">
        <p className="text-[13px] text-white/80">{metricsCopy.calculationFailed}</p>
        <p className="text-[12px] text-muted-foreground">{metricsCopy.calculationFailedHint}</p>
      </div>
    );
  }

  const isEmployment = analysis.contractType === "employment";
  const concepts = buildFinancialConcepts(financialMetrics, analysis.contractType);
  const groups = isEmployment ? null : groupContractFinancialConcepts(concepts);
  const employmentGroups = isEmployment ? groupEmploymentFinancialConcepts(concepts) : null;
  const durationFacts = buildDurationFacts(financialMetrics, concepts);

  const groupTitles: Record<ContractFinancialGroup, string> = {
    whatYoullPay: copy.finances.whatYoullPayTitle,
    feesAndCosts: copy.finances.feesAndCostsTitle,
    conditionalAmounts: copy.finances.conditionalAmountsTitle,
    financingAndCredit: copy.finances.financingAndCreditTitle,
    ratesAndPercentages: copy.finances.ratesAndPercentagesTitle,
    otherStatedAmounts: copy.finances.otherStatedAmountsTitle,
  };

  const employmentGroupTitles: Record<EmploymentFinancialGroup, string> = {
    whatYouWillReceive: copy.employmentFinances.whatYouWillReceiveTitle,
    compensationBreakdown: copy.employmentFinances.compensationBreakdownTitle,
    conditionalOrNonGuaranteed: copy.employmentFinances.conditionalOrNonGuaranteedTitle,
    potentialDeductions: copy.employmentFinances.potentialDeductionsTitle,
    otherBenefits: copy.employmentFinances.otherBenefitsTitle,
  };

  const employmentGroupNotices: Partial<Record<EmploymentFinancialGroup, string>> = {
    conditionalOrNonGuaranteed: copy.employmentFinances.conditionalOrNonGuaranteedNotice,
    potentialDeductions: copy.employmentFinances.potentialDeductionsNotice,
  };

  function amountCellText(item: FinancialConceptItem): string {
    const money = formatMoneyMetric(item.amount, language, "");
    if (money.kind === "value") {
      return isStatedCapText(item) ? `${copy.finances.upToPrefix} ${money.text}` : money.text;
    }
    if (item.percentage) {
      const pct = formatPercentageMetric(item.percentage, language, "", percentSign);
      if (pct.kind === "value") {
        return isStatedCapText(item) ? `${copy.finances.upToPrefix} ${pct.text}` : pct.text;
      }
    }
    return "";
  }

  function conceptLabel(item: FinancialConceptItem): string {
    if (item.conceptId === "other") {
      const sanitized = sanitizeDisplayText(item.label);
      if (sanitized) return sanitized;
    }
    return getCanonicalConceptLabel(item.conceptId, language);
  }

  function frequencyText(item: FinancialConceptItem): string | null {
    if (!item.frequency || item.frequency === "unknown") {
      return null;
    }
    return metricsCopy.frequencyLabels[item.frequency];
  }

  /**
   * A duration and an installment count are two distinct semantic facts —
   * each gets its own dedicated, generic label (never inferred from an
   * unrelated monetary concept, e.g. "Monthly installment") so "contract
   * duration" and "number of installments" are never confused with each
   * other or with the payment they happen to describe.
   */
  function durationFactLabel(fact: DurationFact): string {
    return fact.kind === "installmentCount" ? copy.finances.installmentCountLabel : copy.finances.durationLabel;
  }

  function durationFactValueText(fact: DurationFact): string {
    if (fact.kind === "installmentCount") {
      return formatCount(fact.value, language);
    }
    const unitLabel = fact.unit ? copy.finances.durationUnitLabels[fact.unit] : "";
    return `${formatCount(fact.value, language)} ${unitLabel}`;
  }

  const hasAnyFacts = isEmployment
    ? EMPLOYMENT_GROUP_ORDER.some((group) => (employmentGroups?.[group]?.length ?? 0) > 0) || durationFacts.length > 0
    : GROUP_ORDER.some((group) => (groups?.[group]?.length ?? 0) > 0) || durationFacts.length > 0;

  if (!hasAnyFacts) {
    return (
      <div dir={language === "ar" ? "rtl" : "ltr"} className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-[13px] text-muted-foreground" data-testid="finances-empty">
          {copy.finances.emptyState}
        </p>
      </div>
    );
  }

  const employmentIconFor = (group: EmploymentFinancialGroup, item: FinancialConceptItem) => {
    if (group === "potentialDeductions") return <ShieldAlert size={14} />;
    if (group === "conditionalOrNonGuaranteed") return item.source === "penalty" ? <ShieldAlert size={14} /> : <Receipt size={14} />;
    return <Landmark size={14} />;
  };

  return (
    <div dir={language === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-3" data-testid="contract-financial-facts">
      {isEmployment
        ? EMPLOYMENT_GROUP_ORDER.map((group) => {
            const items = employmentGroups?.[group];
            if (!items || items.length === 0) {
              return null;
            }
            const notice = employmentGroupNotices[group];
            return (
              <GroupAccordion
                key={group}
                title={employmentGroupTitles[group]}
                expanded={expandedGroups.has(group)}
                onToggle={() => toggleGroup(group)}
                testId={`finances-group-${group}`}
              >
                {notice && <p className="text-[12px] text-muted-foreground mb-1">{notice}</p>}
                {items.map((item) => {
                  const amountText = amountCellText(item);
                  const frequency = frequencyText(item);
                  const trigger =
                    group === "conditionalOrNonGuaranteed" || group === "potentialDeductions" ? sanitizeDisplayText(item.trigger) : null;
                  return (
                    <div key={item.id} data-testid={`finances-item-${item.id}`} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-b-0">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                        {employmentIconFor(group, item)}
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14px] text-white font-semibold truncate">{conceptLabel(item)}</p>
                          {frequency && <p className="text-xs text-muted-foreground mt-0.5">{frequency}</p>}
                          {trigger && <p className="text-xs text-muted-foreground mt-0.5">{trigger}</p>}
                        </div>
                        {amountText && <p className="text-[14px] text-white font-bold whitespace-nowrap">{amountText}</p>}
                      </div>
                    </div>
                  );
                })}
              </GroupAccordion>
            );
          })
        : GROUP_ORDER.map((group) => {
            const items = groups?.[group];
            if (!items || items.length === 0) {
              return null;
            }
            return (
              <GroupAccordion
                key={group}
                title={groupTitles[group]}
                expanded={expandedGroups.has(group)}
                onToggle={() => toggleGroup(group)}
                testId={`finances-group-${group}`}
              >
                {group === "conditionalAmounts" && <p className="text-[12px] text-muted-foreground mb-1">{copy.finances.conditionalAmountsNotice}</p>}
                {items.map((item) => {
                  const amountText = amountCellText(item);
                  const frequency = frequencyText(item);
                  const trigger = group === "conditionalAmounts" ? sanitizeDisplayText(item.trigger) : null;
                  return (
                    <div key={item.id} data-testid={`finances-item-${item.id}`} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-b-0">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                        {group === "conditionalAmounts" ? (
                          item.source === "penalty" ? <ShieldAlert size={14} /> : <Receipt size={14} />
                        ) : (
                          <Landmark size={14} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14px] text-white font-semibold truncate">{conceptLabel(item)}</p>
                          {frequency && <p className="text-xs text-muted-foreground mt-0.5">{frequency}</p>}
                          {trigger && <p className="text-xs text-muted-foreground mt-0.5">{trigger}</p>}
                        </div>
                        {amountText && <p className="text-[14px] text-white font-bold whitespace-nowrap">{amountText}</p>}
                      </div>
                    </div>
                  );
                })}
              </GroupAccordion>
            );
          })}

      {durationFacts.length > 0 && (
        <GroupAccordion
          title={copy.finances.durationsAndCountsTitle}
          expanded={expandedGroups.has("durationsAndCounts")}
          onToggle={() => toggleGroup("durationsAndCounts")}
          testId="finances-group-durationsAndCounts"
        >
          {durationFacts.map((fact, index) => (
            <div key={index} data-testid={`finances-duration-${index}`} className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-b-0">
              <p className="text-[14px] text-white font-semibold">{durationFactLabel(fact)}</p>
              <p className="text-[14px] text-white font-bold whitespace-nowrap">{durationFactValueText(fact)}</p>
            </div>
          ))}
        </GroupAccordion>
      )}
    </div>
  );
}
