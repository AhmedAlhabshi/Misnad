import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Sparkles, Users } from "lucide-react";
import { CONTRACT_TYPE_LABELS_AR, CONTRACT_TYPE_LABELS_EN, type AnalysisLanguage, type ContractType } from "@workspace/contract-types";
import type { ContractAnalysisResult, ImportantClause } from "@/types/analysis";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { sanitizeDisplayText } from "@/lib/textSanitization";
import { deduplicateClauses } from "@/lib/clauseDedup";

/** Real, present typeDetails fields that can meaningfully identify *this* contract — never fabricated. */
const DESCRIPTOR_FIELDS: Partial<Record<ContractType, string[]>> = {
  lease: ["propertyAddress"],
  mortgage: ["propertyAddress"],
  auto_finance: ["vehicleMake", "vehicleModel", "vehicleYear"],
  insurance: ["insuranceType"],
  employment: ["jobTitle"],
  subscription: ["serviceName"],
};

interface ContractTitleParts {
  typeLabel: string;
  /** A real, present typeDetails value (e.g. a vehicle make/model/year) — may mix scripts/digits, so it's rendered in its own bidi-isolated span, never concatenated into the title string. */
  descriptor: string | null;
}

function buildContractTitleParts(analysis: ContractAnalysisResult, language: AnalysisLanguage): ContractTitleParts {
  const typeLabel = language === "ar" ? CONTRACT_TYPE_LABELS_AR[analysis.contractType] : CONTRACT_TYPE_LABELS_EN[analysis.contractType];
  const fields = DESCRIPTOR_FIELDS[analysis.contractType] ?? [];
  const descriptor = fields
    .map((field) => analysis.typeDetails[field])
    .filter((value): value is string | number => (typeof value === "string" && value.trim().length > 0) || typeof value === "number")
    .map((value) => sanitizeDisplayText(String(value)))
    .filter((value): value is string => value !== null)
    .join(" ");
  return { typeLabel, descriptor: descriptor || null };
}

function ClauseAccordionItem({
  clause,
  index,
  expanded,
  onToggle,
  whatItSaysLabel,
  simpleExplanationLabel,
}: {
  clause: ImportantClause;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  whatItSaysLabel: string;
  simpleExplanationLabel: string;
}) {
  const title = sanitizeDisplayText(clause.title);
  const summary = sanitizeDisplayText(clause.summary);
  const plainExplanation = sanitizeDisplayText(clause.plainExplanation);

  if (!title) {
    return null;
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden" data-testid={`clause-item-${index}`}>
      <button
        onClick={onToggle}
        data-testid={`button-toggle-clause-${index}`}
        className="w-full flex items-center justify-between gap-3 p-4 text-start"
      >
        <span className="text-[14px] font-semibold text-white break-words">{title}</span>
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} className="inline-flex shrink-0 text-muted-foreground">
          <ChevronDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 flex flex-col gap-3 text-start" data-testid={`clause-details-${index}`}>
              {summary && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{whatItSaysLabel}</p>
                  <p className="text-[13px] text-white/90 leading-relaxed">{summary}</p>
                </div>
              )}
              {plainExplanation && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{simpleExplanationLabel}</p>
                  <p className="text-[13px] text-white/90 leading-relaxed">{plainExplanation}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function OverviewTab({ analysis, language }: { analysis: ContractAnalysisResult; language: AnalysisLanguage }) {
  const [showSimpleExplanation, setShowSimpleExplanation] = useState(false);
  const [partiesExpanded, setPartiesExpanded] = useState(false);
  const [expandedClauses, setExpandedClauses] = useState<Set<number>>(new Set());

  const copy = RESULTS_COPY[language];
  const titleParts = buildContractTitleParts(analysis, language);
  const explanationText = sanitizeDisplayText(showSimpleExplanation ? analysis.contractSummarySimple : analysis.contractSummary);
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
    <div dir={language === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-bold text-white break-words text-start" data-testid="text-contract-title">
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

      {explanationText && (
        <div>
          <h2 className="text-base font-bold text-white mb-2 text-start">{copy.overview.explanationTitle}</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed text-start" data-testid="text-contract-explanation">
            {explanationText}
          </p>
          <button
            onClick={() => setShowSimpleExplanation((v) => !v)}
            data-testid="button-toggle-simplify"
            className="mt-3 h-11 px-5 inline-flex items-center gap-2 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 font-semibold text-[13px] hover:bg-indigo-500/25 active:bg-indigo-500/30 transition-colors"
          >
            <Sparkles size={16} className="shrink-0" />
            <span>{showSimpleExplanation ? copy.overview.showOriginalAction : copy.overview.simplifyAction}</span>
          </button>
        </div>
      )}

      <div>
        <h2 className="text-base font-bold text-white mb-3 text-start">{copy.overview.clausesTitle}</h2>
        {clauses.length > 0 ? (
          <div className="flex flex-col gap-2" data-testid="clauses-accordion">
            {clauses.map((clause, index) => (
              <ClauseAccordionItem
                key={index}
                clause={clause}
                index={index}
                expanded={expandedClauses.has(index)}
                onToggle={() => toggleClause(index)}
                whatItSaysLabel={copy.overview.whatItSaysLabel}
                simpleExplanationLabel={copy.overview.simpleExplanationLabel}
              />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground text-start" data-testid="clauses-empty">
            {copy.overview.clausesEmpty}
          </p>
        )}
      </div>

      {analysis.parties.length > 0 && (
        <div>
          <button
            onClick={() => setPartiesExpanded((v) => !v)}
            data-testid="button-toggle-parties"
            className="flex items-center justify-between w-full text-base font-bold text-white mb-3 text-start"
          >
            <span>{copy.overview.partiesTitle}</span>
            <motion.span animate={{ rotate: partiesExpanded ? 180 : 0 }} className="inline-flex shrink-0 text-muted-foreground">
              <ChevronDown size={18} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {partiesExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-2">
                  {analysis.parties.map((party, index) => {
                    const name = sanitizeDisplayText(party.name);
                    const identifier = sanitizeDisplayText(party.identifier);
                    const notes = sanitizeDisplayText(party.notes);
                    return (
                      <div
                        key={index}
                        data-testid={`overview-party-${index}`}
                        className="bg-white/5 border border-white/10 rounded-[16px] p-4 flex items-start gap-3"
                      >
                        <div className="w-9 h-9 rounded-full bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                          <Users size={16} />
                        </div>
                        <div className="flex-1 min-w-0 text-start">
                          <p className="text-[14px] text-white font-semibold">{party.role}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                            {name && <span>{name}</span>}
                            {identifier && <span>{identifier}</span>}
                            {notes && <span>{notes}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
