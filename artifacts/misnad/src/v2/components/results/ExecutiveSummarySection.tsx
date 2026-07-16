import { AlertTriangle, HelpCircle, Receipt } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult } from "@/types/analysis";
import { buildFinancialConcepts } from "@/lib/financialConcepts";
import { V2_COPY } from "../../copy";
import { buildExecutiveSummary, type ExecutiveFinding, type ExecutiveFindingKind } from "../../lib/executiveSummary";
import EmptyStateCard from "../ui/EmptyStateCard";
import RiskBadge from "../ui/RiskBadge";

const KIND_ICON: Record<ExecutiveFindingKind, typeof AlertTriangle> = {
  risk_clause: AlertTriangle,
  conditional_cost: Receipt,
  missing_information: HelpCircle,
};

function FindingCard({ finding, language }: { finding: ExecutiveFinding; language: AnalysisLanguage }) {
  const v2Copy = V2_COPY[language];
  const Icon = KIND_ICON[finding.kind];
  const badgeLabel =
    finding.kind === "risk_clause"
      ? v2Copy.executiveSummary.riskClauseBadge
      : finding.kind === "conditional_cost"
        ? v2Copy.executiveSummary.conditionalCostBadge
        : v2Copy.executiveSummary.missingInfoBadge;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4" data-testid={`executive-finding-${finding.kind}`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{finding.title}</p>
          {finding.riskLevel ? (
            <RiskBadge level={finding.riskLevel} language={language} />
          ) : (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{badgeLabel}</span>
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{finding.description}</p>
      </div>
    </div>
  );
}

export default function ExecutiveSummarySection({
  analysis,
  financialMetrics,
  language,
}: {
  analysis: ContractAnalysisResult;
  financialMetrics: FinancialMetrics | null;
  language: AnalysisLanguage;
}) {
  const v2Copy = V2_COPY[language];
  const isAr = language === "ar";
  const concepts = financialMetrics ? buildFinancialConcepts(financialMetrics, analysis.contractType) : [];
  const findings = buildExecutiveSummary(analysis, concepts, language);

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="flex flex-col gap-4" data-testid="executive-summary-section">
      <h2 className="text-lg font-bold text-foreground">{v2Copy.executiveSummary.title}</h2>
      {findings.length === 0 ? (
        <EmptyStateCard icon={HelpCircle} title={v2Copy.executiveSummary.empty} testId="executive-summary-empty" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {findings.map((finding, index) => (
            <FindingCard key={index} finding={finding} language={language} />
          ))}
        </div>
      )}
    </div>
  );
}
