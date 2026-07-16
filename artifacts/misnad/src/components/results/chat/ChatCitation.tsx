import { useState } from "react";
import { ExternalLink, FileText, Scale } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { ComposedCitation } from "@workspace/answer-composer";
import { RESULTS_COPY } from "@/lib/resultsCopy";

/**
 * Renders exactly one citation the API already returned — never
 * constructs a URL, never fabricates a label, never shows a citation the
 * API didn't include. A contract citation (`source: "contract"`) is
 * always an internal reference string (e.g. "Your contract — Early
 * Termination"), never rendered as a link. A legal citation
 * (`source: "legal"`) may be opened, and only at the exact
 * `citation.citation` URL the API returned — this component never
 * derives or edits that URL.
 */
export default function ChatCitation({ citation, language }: { citation: ComposedCitation; language: AnalysisLanguage }) {
  const copy = RESULTS_COPY[language].chat;
  const [expanded, setExpanded] = useState(false);
  const isLegal = citation.source === "legal";

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-1.5"
      data-testid={`chat-citation-${citation.source}`}
    >
      <div className="flex items-center gap-1.5">
        {isLegal ? <Scale size={13} className="text-emerald-400 shrink-0" /> : <FileText size={13} className="text-indigo-400 shrink-0" />}
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${isLegal ? "text-emerald-400" : "text-indigo-400"}`}>
          {isLegal ? copy.legalCitationLabel : copy.contractCitationLabel}
        </span>
      </div>

      <p className="text-[13px] font-semibold text-white" data-testid="chat-citation-label">
        {citation.label}
      </p>

      {isLegal && citation.authority && (
        <p className="text-[11px] text-muted-foreground" data-testid="chat-citation-authority">
          {citation.authority}
        </p>
      )}

      {citation.excerpt && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            data-testid="chat-citation-toggle-excerpt"
            className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded"
          >
            {expanded ? copy.hideExcerpt : copy.showExcerpt}
          </button>
          {expanded && (
            <p className="mt-1.5 text-[12px] text-muted-foreground leading-relaxed" dir="auto" data-testid="chat-citation-excerpt">
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
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 rounded w-fit"
        >
          <span>{copy.viewOfficialSource}</span>
          <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}
