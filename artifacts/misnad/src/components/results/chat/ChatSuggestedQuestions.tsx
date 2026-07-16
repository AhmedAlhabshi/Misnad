import type { AnalysisLanguage } from "@workspace/contract-types";
import { RESULTS_COPY } from "@/lib/resultsCopy";

/**
 * Frontend-only convenience prompts. Selecting one calls `onSelect` with
 * the plain question text — the parent sends it through the exact same
 * `sendChatMessage` pipeline as anything typed by hand; nothing here talks
 * to the API directly.
 */
export default function ChatSuggestedQuestions({
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
      <div className="flex flex-col gap-2">
        {questions.map((question, index) => (
          <button
            key={index}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(question)}
            data-testid={`chat-suggested-question-${index}`}
            className="text-start text-[13px] text-white bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 hover:bg-white/10 disabled:opacity-50 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
