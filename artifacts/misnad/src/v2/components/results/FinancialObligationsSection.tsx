import { AlertCircle, Landmark, Receipt, ShieldAlert } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult } from "@/types/analysis";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { FINANCIAL_METRICS_COPY, getCanonicalConceptLabel } from "@/lib/financialMetricsCopy";
import { formatCount, formatMoneyMetric, formatPercentageMetric } from "@/lib/financialFormatters";
import {
  buildDurationFacts,
  buildFinancialConcepts,
  groupContractFinancialConcepts,
  isStatedCapText,
  type ContractFinancialGroup,
  type DurationFact,
  type FinancialConceptItem,
} from "@/lib/financialConcepts";
import { sanitizeDisplayText } from "@/lib/textSanitization";
import SectionCard from "../ui/SectionCard";
import EmptyStateCard from "../ui/EmptyStateCard";
import { V2_COPY } from "../../copy";

const PERCENT_SIGN: Record<AnalysisLanguage, string> = { ar: "٪", en: "%" };

const GROUP_ORDER: ContractFinancialGroup[] = [
  "whatYoullPay",
  "feesAndCosts",
  "conditionalAmounts",
  "financingAndCredit",
  "ratesAndPercentages",
  "otherStatedAmounts",
];

export default function FinancialObligationsSection({
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
  const metricsCopy = FINANCIAL_METRICS_COPY[language];
  const percentSign = PERCENT_SIGN[language];
  const isAr = language === "ar";

  if (!financialMetrics) {
    return (
      <div dir={isAr ? "rtl" : "ltr"}>
        <EmptyStateCard
          icon={AlertCircle}
          title={metricsCopy.calculationFailed}
          body={metricsCopy.calculationFailedHint}
          tone="danger"
          testId="finances-unavailable"
        />
      </div>
    );
  }

  const concepts = buildFinancialConcepts(financialMetrics, analysis.contractType);
  const groups = groupContractFinancialConcepts(concepts);
  const durationFacts = buildDurationFacts(financialMetrics, concepts);

  const groupTitles: Record<ContractFinancialGroup, string> = {
    whatYoullPay: copy.finances.whatYoullPayTitle,
    feesAndCosts: copy.finances.feesAndCostsTitle,
    conditionalAmounts: copy.finances.conditionalAmountsTitle,
    financingAndCredit: copy.finances.financingAndCreditTitle,
    ratesAndPercentages: copy.finances.ratesAndPercentagesTitle,
    otherStatedAmounts: copy.finances.otherStatedAmountsTitle,
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
    if (!item.frequency || item.frequency === "unknown") return null;
    return metricsCopy.frequencyLabels[item.frequency];
  }

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

  const hasAnyFacts = GROUP_ORDER.some((group) => (groups[group]?.length ?? 0) > 0) || durationFacts.length > 0;

  if (!hasAnyFacts) {
    return (
      <div dir={isAr ? "rtl" : "ltr"}>
        <EmptyStateCard icon={AlertCircle} title={copy.finances.emptyState} testId="finances-empty" />
      </div>
    );
  }

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="flex flex-col gap-4" data-testid="contract-financial-facts">
      <h2 className="text-lg font-bold text-foreground">{v2Copy.financialObligations.title}</h2>

      {GROUP_ORDER.map((group) => {
        const items = groups[group];
        if (!items || items.length === 0) return null;
        return (
          <SectionCard key={group} title={groupTitles[group]} testId={`finances-group-${group}`}>
            {group === "conditionalAmounts" && (
              <p className="mb-2 text-xs text-muted-foreground">{copy.finances.conditionalAmountsNotice}</p>
            )}
            <div className="flex flex-col">
              {items.map((item) => {
                const amountText = amountCellText(item);
                const frequency = frequencyText(item);
                const trigger = group === "conditionalAmounts" ? sanitizeDisplayText(item.trigger) : null;
                return (
                  <div
                    key={item.id}
                    data-testid={`finances-item-${item.id}`}
                    className="flex items-start gap-3 border-b border-border py-3 last:border-b-0"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      {group === "conditionalAmounts" ? (
                        item.source === "penalty" ? <ShieldAlert size={14} /> : <Receipt size={14} />
                      ) : (
                        <Landmark size={14} />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{conceptLabel(item)}</p>
                        {frequency && <p className="mt-0.5 text-xs text-muted-foreground">{frequency}</p>}
                        {trigger && <p className="mt-0.5 text-xs text-muted-foreground">{trigger}</p>}
                      </div>
                      {amountText && <p className="whitespace-nowrap text-sm font-bold text-foreground">{amountText}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        );
      })}

      {durationFacts.length > 0 && (
        <SectionCard title={copy.finances.durationsAndCountsTitle} testId="finances-group-durationsAndCounts">
          <div className="flex flex-col">
            {durationFacts.map((fact, index) => (
              <div
                key={index}
                data-testid={`finances-duration-${index}`}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
              >
                <p className="text-sm font-semibold text-foreground">{durationFactLabel(fact)}</p>
                <p className="whitespace-nowrap text-sm font-bold text-foreground">{durationFactValueText(fact)}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
