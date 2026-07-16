import { useState } from "react";
import { ChevronDown, Sparkles, Users } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult, RiskLevel } from "@/types/analysis";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { sanitizeDisplayText } from "@/lib/textSanitization";
import { deduplicateClauses } from "@/lib/clauseDedup";
import { buildDurationFacts, buildFinancialConcepts, selectApplicableMonthlyOutflow } from "@/lib/financialConcepts";
import { formatContractDuration, formatMoneyMetric } from "@/lib/financialFormatters";
import { Button } from "@/components/ui/button";
import { V2_COPY } from "../../copy";
import { buildContractTitleParts } from "../../lib/contractTitle";
import SectionCard from "../ui/SectionCard";
import StatStrip, { type StatItem } from "../ui/StatStrip";
import RiskBadge from "../ui/RiskBadge";

const RISK_RANK: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };

function worstRiskLevel(clauses: readonly { riskLevel: RiskLevel | null }[]): RiskLevel | null {
  let worst: RiskLevel | null = null;
  for (const clause of clauses) {
    if (!clause.riskLevel) continue;
    if (worst === null || RISK_RANK[clause.riskLevel] < RISK_RANK[worst]) {
      worst = clause.riskLevel;
    }
  }
  return worst;
}

export default function OverviewSection({
  analysis,
  financialMetrics,
  language,
}: {
  analysis: ContractAnalysisResult;
  financialMetrics: FinancialMetrics | null;
  language: AnalysisLanguage;
}) {
  const [showSimpleExplanation, setShowSimpleExplanation] = useState(false);
  const [partiesExpanded, setPartiesExpanded] = useState(false);

  const copy = RESULTS_COPY[language];
  const v2Copy = V2_COPY[language];
  const isAr = language === "ar";
  const titleParts = buildContractTitleParts(analysis, language);
  const explanationText = sanitizeDisplayText(showSimpleExplanation ? analysis.contractSummarySimple : analysis.contractSummary);

  const clauses = deduplicateClauses(analysis.importantClauses);
  const overallRisk = worstRiskLevel(clauses);

  const concepts = financialMetrics ? buildFinancialConcepts(financialMetrics, analysis.contractType) : [];
  const durationFacts = financialMetrics ? buildDurationFacts(financialMetrics, concepts) : [];
  const contractDurationFact = durationFacts.find((fact) => fact.kind === "contractDuration");
  const monthlyOutflow = selectApplicableMonthlyOutflow(concepts);

  const stats: StatItem[] = [];
  if (overallRisk) {
    stats.push({ key: "risk", label: v2Copy.overview.riskLabel, value: <RiskBadge level={overallRisk} language={language} /> });
  }
  if (financialMetrics && financialMetrics.contractDuration.status !== "unavailable") {
    const durationUnitCopy = { ...copy.finances.durationUnitLabels, weeks: language === "ar" ? "أسبوع" : "week(s)" };
    const formatted = formatContractDuration(financialMetrics.contractDuration, language, "", durationUnitCopy);
    if (formatted.kind === "value") {
      stats.push({ key: "duration", label: v2Copy.overview.durationLabel, value: formatted.primaryText });
    }
  } else if (contractDurationFact) {
    stats.push({
      key: "duration",
      label: v2Copy.overview.durationLabel,
      value: `${contractDurationFact.value} ${contractDurationFact.unit ? copy.finances.durationUnitLabels[contractDurationFact.unit] : ""}`,
    });
  }
  if (monthlyOutflow) {
    const formatted = formatMoneyMetric({ value: monthlyOutflow.value, currency: monthlyOutflow.currency, reason: null }, language, "");
    if (formatted.kind === "value") {
      stats.push({ key: "monthly", label: v2Copy.overview.monthlyCommitmentLabel, value: formatted.text });
    }
  }
  if (financialMetrics) {
    const knownCost = formatMoneyMetric(financialMetrics.totalCost.calculatedKnownCost, language, "");
    if (knownCost.kind === "value") {
      stats.push({ key: "totalCost", label: v2Copy.overview.totalCostLabel, value: knownCost.text });
    }
  }

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-contract-title">
          {titleParts.typeLabel}
          {titleParts.descriptor && (
            <>
              {" — "}
              <span dir="auto" className="[unicode-bidi:isolate]" data-testid="text-contract-title-descriptor">
                {titleParts.descriptor}
              </span>
            </>
          )}
        </h1>
      </div>

      <StatStrip items={stats} />

      {explanationText && (
        <SectionCard title={copy.overview.explanationTitle} testId="overview-explanation">
          <p className="text-sm leading-relaxed text-muted-foreground" data-testid="text-contract-explanation">
            {explanationText}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSimpleExplanation((v) => !v)}
            data-testid="button-toggle-simplify"
            className="mt-3 gap-1.5"
          >
            <Sparkles size={14} />
            <span>{showSimpleExplanation ? copy.overview.showOriginalAction : copy.overview.simplifyAction}</span>
          </Button>
        </SectionCard>
      )}

      {analysis.parties.length > 0 && (
        <SectionCard testId="overview-parties">
          <button
            onClick={() => setPartiesExpanded((v) => !v)}
            data-testid="button-toggle-parties"
            className="flex w-full items-center justify-between text-sm font-semibold text-foreground"
          >
            <span>{copy.overview.partiesTitle}</span>
            <ChevronDown size={16} className={`text-muted-foreground transition-transform ${partiesExpanded ? "rotate-180" : ""}`} />
          </button>
          {partiesExpanded && (
            <div className="mt-3 flex flex-col gap-2">
              {analysis.parties.map((party, index) => {
                const name = sanitizeDisplayText(party.name);
                const identifier = sanitizeDisplayText(party.identifier);
                const notes = sanitizeDisplayText(party.notes);
                return (
                  <div key={index} data-testid={`overview-party-${index}`} className="flex items-start gap-3 rounded-md border border-border p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Users size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{party.role}</p>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {name && <span>{name}</span>}
                        {identifier && <span>{identifier}</span>}
                        {notes && <span>{notes}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
