import { useState } from "react";
import { ExternalLink, FileText, Scale } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { ComposedCitation } from "@workspace/answer-composer";
import { RESULTS_COPY } from "@/lib/resultsCopy";

/**
 * Same citation-rendering contract as V1's `ChatCitation.tsx` — renders
 * exactly one citation the API already returned, never constructs a URL,
 * never fabricates a label. A contract citation is never a link; a legal
 * citation may only open the exact `citation.citation` URL the API
 * returned.
 */
export default function AdvisorCitation({ citation, language }: { citation: ComposedCitation; language: AnalysisLanguage }) {
  const copy = RESULTS_COPY[language].chat;
  const [expanded, setExpanded] = useState(false);
  const isLegal = citation.source === "legal";

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-background p-3" data-testid={`chat-citation-${citation.source}`}>
      <div className="flex items-center gap-1.5">
        {isLegal ? <Scale size={13} className="shrink-0 text-v2-success" /> : <FileText size={13} className="shrink-0 text-v2-info" />}
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${isLegal ? "text-v2-success" : "text-v2-info"}`}>
          {isLegal ? copy.legalCitationLabel : copy.contractCitationLabel}
        </span>
      </div>

      <p className="text-sm font-semibold text-foreground" data-testid="chat-citation-label">
        {citation.label}
      </p>

      {isLegal && citation.authority && (
        <p className="text-xs text-muted-foreground" data-testid="chat-citation-authority">
          {citation.authority}
        </p>
      )}

      {citation.excerpt && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            data-testid="chat-citation-toggle-excerpt"
            className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
          >
            {expanded ? copy.hideExcerpt : copy.showExcerpt}
          </button>
          {expanded && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground" dir="auto" data-testid="chat-citation-excerpt">
              {citation.excerpt}
            </p>
          )}
        </div>
      )}

      {isLegal && (
        <a
          href={citation.citation}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="chat-citation-official-link"
          className="mt-1 inline-flex w-fit items-center gap-1 text-xs font-semibold text-v2-success hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
        >
          <span>{copy.viewOfficialSource}</span>
          <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}
