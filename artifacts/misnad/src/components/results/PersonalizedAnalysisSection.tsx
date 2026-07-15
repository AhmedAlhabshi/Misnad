import { useEffect, useState } from "react";
import { HelpCircle, Lightbulb } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { ContractAnalysisResult } from "@/types/analysis";
import type { FinancialConceptItem } from "@/lib/financialConcepts";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { getCanonicalConceptLabel } from "@/lib/financialMetricsCopy";
import { sanitizeDisplayText } from "@/lib/textSanitization";
import { deduplicateClauses } from "@/lib/clauseDedup";
import Accordion from "./shared/Accordion";

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

interface BudgetInputs {
  monthlyIncome: number;
  essentialExpenses: number;
  existingMonthlyDebt: number;
  savings: number | null;
}

type SectionState = "loading" | "success" | "unavailable";

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
 * Sections 2-4 of the Personalized Financial Analysis: combines the
 * deterministic budget metrics, the classified contract financial concepts,
 * and the actual extracted clauses into a single sanitized request to the
 * `/api/analyze-financial-impact` endpoint, then renders the strict 3-section
 * response ("How does the contract affect you?" / "Things to watch" /
 * "Before you sign") as collapsed-by-default accordions. All arithmetic is
 * already done before this request is built — the AI only interprets. A
 * failure degrades to an honest "unavailable" message; the deterministic
 * numbers shown in the budget-impact accordion remain fully valid either way.
 */
export default function PersonalizedAnalysisSection({
  language,
  analysis,
  concepts,
  currency,
  applicableMonthlyOutflow,
  applicableUpfrontLiquidity,
  budgetInputs,
  availableBeforeContract,
  availableAfterContract,
  contractIncomeRatio,
  totalCommitmentRatio,
  remainingSavings,
  emergencyCoverageMonths,
}: {
  language: AnalysisLanguage;
  analysis: ContractAnalysisResult;
  concepts: FinancialConceptItem[];
  currency: string | null;
  applicableMonthlyOutflow: number | null;
  applicableUpfrontLiquidity: number | null;
  budgetInputs: BudgetInputs;
  availableBeforeContract: number;
  availableAfterContract: number | null;
  contractIncomeRatio: number | null;
  totalCommitmentRatio: number | null;
  remainingSavings: number | null;
  emergencyCoverageMonths: number | null;
}) {
  const copy = RESULTS_COPY[language].financialAnalysis.personalizedAnalysis;
  const [state, setState] = useState<SectionState>("loading");
  const [data, setData] = useState<PersonalizedAnalysisResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setData(null);

    async function run() {
      try {
        const payload = {
          analysisLanguage: language,
          contractType: analysis.contractType,
          contractSummary: sanitizeDisplayText(analysis.contractSummary) ?? "",
          clauses: buildClausePayload(analysis),
          financialConcepts: buildConceptsPayload(concepts, language),
          budgetMetrics: {
            monthlyIncome: budgetInputs.monthlyIncome,
            essentialExpenses: budgetInputs.essentialExpenses,
            existingMonthlyDebt: budgetInputs.existingMonthlyDebt,
            savings: budgetInputs.savings,
            currency,
            applicableMonthlyOutflow,
            applicableUpfrontLiquidity,
            availableBeforeContract,
            availableAfterContract,
            contractIncomeRatio,
            totalCommitmentRatio,
            remainingSavings,
            emergencyCoverageMonths,
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
          throw new Error("Personalized analysis request failed.");
        }

        if (cancelled) return;
        setData(body.analysis);
        setState("success");
      } catch {
        if (cancelled) return;
        setState("unavailable");
      }
    }

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, language]);

  if (state === "loading") {
    return (
      <div
        dir={language === "ar" ? "rtl" : "ltr"}
        className="flex flex-col items-center justify-center gap-2 py-10 text-center"
        data-testid="personalized-analysis-loading"
      >
        <p className="text-[13px] text-muted-foreground">{copy.loading}</p>
      </div>
    );
  }

  if (state === "unavailable" || !data) {
    return (
      <div
        dir={language === "ar" ? "rtl" : "ltr"}
        className="flex flex-col items-center justify-center gap-2 py-8 text-center"
        data-testid="personalized-analysis-unavailable"
      >
        <p className="text-[13px] text-muted-foreground">{copy.unavailable}</p>
      </div>
    );
  }

  const sections: { key: "personalImpact" | "thingsToWatch"; title: string; items: InsightItem[] }[] = [
    { key: "personalImpact", title: copy.personalImpactTitle, items: data.personalImpact },
    { key: "thingsToWatch", title: copy.thingsToWatchTitle, items: data.thingsToWatch },
  ];

  return (
    <div dir={language === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-3" data-testid="personalized-analysis-section">
      {sections.map(({ key, title, items }) => {
        if (items.length === 0) {
          return null;
        }
        return (
          <Accordion key={key} title={title} expanded={expanded.has(key)} onToggle={() => toggle(key)} testId={`personalized-analysis-${key}`}>
            {items.map((item, index) => (
              <div key={index} className="border-b border-white/5 last:border-0 pb-2 last:pb-0">
                <p className="text-[13px] text-white font-semibold">{item.title}</p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{item.explanation}</p>
              </div>
            ))}
          </Accordion>
        );
      })}

      {data.beforeYouSign.length > 0 && (
        <Accordion
          title={copy.beforeYouSignTitle}
          expanded={expanded.has("beforeYouSign")}
          onToggle={() => toggle("beforeYouSign")}
          testId="personalized-analysis-beforeYouSign"
        >
          {data.beforeYouSign.map((item, index) => {
            const isQuestion = item.type === "question";
            const Icon = isQuestion ? HelpCircle : Lightbulb;
            const badgeLabel = isQuestion ? copy.questionLabel : copy.adviceLabel;
            return (
              <div key={index} className="border-b border-white/5 last:border-0 pb-2 last:pb-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={13} className={isQuestion ? "text-indigo-400" : "text-emerald-400"} />
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${isQuestion ? "text-indigo-400" : "text-emerald-400"}`}>
                    {badgeLabel}
                  </span>
                </div>
                <p className="text-[13px] text-white font-semibold">{item.title}</p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{item.text}</p>
              </div>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
