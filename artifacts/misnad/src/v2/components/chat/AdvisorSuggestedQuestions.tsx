import type { AnalysisLanguage } from "@workspace/contract-types";
import { RESULTS_COPY } from "@/lib/resultsCopy";

/** Plain, text-forward prompt list — reads like suggested topics from an advisor, not chatbot "quick reply" pill buttons. */
export default function AdvisorSuggestedQuestions({
  questions,
  language,
  disabled,
  onSelect,
}: {
  questions: string[];
  language: AnalysisLanguage;
  disabled: boolean;
  onSelect: (question: string) => void;
}) {
  const copy = RESULTS_COPY[language].chat;

  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2" data-testid="chat-suggested-questions">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{copy.suggestedTitle}</span>
      <div className="flex flex-col gap-1.5">
        {questions.map((question, index) => (
          <button
            key={index}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(question)}
            data-testid={`chat-suggested-question-${index}`}
            className="rounded-md border border-border bg-card px-3.5 py-2.5 text-start text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-muted disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
