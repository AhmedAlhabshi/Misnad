import { useState } from "react";
import { ChevronDown, FileQuestion } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { ContractAnalysisResult, ImportantClause } from "@/types/analysis";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { sanitizeDisplayText } from "@/lib/textSanitization";
import { deduplicateClauses } from "@/lib/clauseDedup";
import { V2_COPY } from "../../copy";
import EmptyStateCard from "../ui/EmptyStateCard";
import RiskBadge from "../ui/RiskBadge";

function ClauseRow({
  clause,
  index,
  expanded,
  onToggle,
  whatItSaysLabel,
  simpleExplanationLabel,
  language,
}: {
  clause: ImportantClause;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  whatItSaysLabel: string;
  simpleExplanationLabel: string;
  language: AnalysisLanguage;
}) {
  const title = sanitizeDisplayText(clause.title);
  const summary = sanitizeDisplayText(clause.summary);
  const plainExplanation = sanitizeDisplayText(clause.plainExplanation);

  if (!title) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card" data-testid={`clause-item-${index}`}>
      <button onClick={onToggle} data-testid={`button-toggle-clause-${index}`} className="flex w-full items-center justify-between gap-3 p-4 text-start">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="min-w-0 break-words text-sm font-semibold text-foreground">{title}</span>
          <RiskBadge level={clause.riskLevel} language={language} className="shrink-0" />
        </div>
        <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="flex flex-col gap-3 px-4 pb-4 text-start" data-testid={`clause-details-${index}`}>
          {summary && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">{whatItSaysLabel}</p>
              <p className="text-sm leading-relaxed text-foreground/90">{summary}</p>
            </div>
          )}
          {plainExplanation && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">{simpleExplanationLabel}</p>
              <p className="text-sm leading-relaxed text-foreground/90">{plainExplanation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ClausesSection({ analysis, language }: { analysis: ContractAnalysisResult; language: AnalysisLanguage }) {
  const [expandedClauses, setExpandedClauses] = useState<Set<number>>(new Set());
  const copy = RESULTS_COPY[language];
  const v2Copy = V2_COPY[language];
  const isAr = language === "ar";
  const clauses = deduplicateClauses(analysis.importantClauses);

  function toggleClause(index: number) {
    setExpandedClauses((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-foreground">{v2Copy.clauses.title}</h2>
      {clauses.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="clauses-accordion">
          {clauses.map((clause, index) => (
            <ClauseRow
              key={index}
              clause={clause}
              index={index}
              expanded={expandedClauses.has(index)}
              onToggle={() => toggleClause(index)}
              whatItSaysLabel={copy.overview.whatItSaysLabel}
              simpleExplanationLabel={copy.overview.simpleExplanationLabel}
              language={language}
            />
          ))}
        </div>
      ) : (
        <EmptyStateCard icon={FileQuestion} title={copy.overview.clausesEmpty} testId="clauses-empty" />
      )}
    </div>
  );
}
