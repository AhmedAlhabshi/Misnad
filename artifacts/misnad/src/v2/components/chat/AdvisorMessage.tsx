import { AlertTriangle, RotateCcw } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { ChatSourceKind } from "@workspace/chat-router";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import type { ChatMessage as ChatMessageType } from "@/lib/chatTypes";
import { Button } from "@/components/ui/button";
import AdvisorCitation from "./AdvisorCitation";

const UNAVAILABLE_SOURCE_ORDER: ChatSourceKind[] = ["contract", "legal", "financial"];

/**
 * Advisor-note styling instead of chat bubbles: the user's question is a
 * plain right-aligned block, the assistant's answer reads as a labelled
 * note (a subtle accent border, not a colored bubble) — never renders
 * `answer.route`/`confidence`/`provider`/`model`, matching V1's own
 * requirement.
 */
export default function AdvisorMessage({
  message,
  language,
  onRetry,
}: {
  message: ChatMessageType;
  language: AnalysisLanguage;
  onRetry: (question: string) => void;
}) {
  const copy = RESULTS_COPY[language].chat;

  if (message.role === "user") {
    return (
      <div className="self-end max-w-[85%] rounded-md bg-muted px-4 py-2.5 text-sm text-foreground whitespace-pre-wrap break-words" data-testid="chat-message-user">
        {message.text}
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="self-start flex max-w-[85%] flex-col gap-2 rounded-md border border-v2-danger/25 bg-v2-danger/5 px-4 py-3" data-testid="chat-message-error">
        <div className="flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-v2-danger" />
          <p className="text-sm text-v2-danger">{message.message}</p>
        </div>
        {message.retryable && (
          <Button variant="outline" size="sm" onClick={() => onRetry(message.retryQuestion)} data-testid="chat-message-retry" className="w-fit gap-1.5">
            <RotateCcw size={12} />
            <span>{copy.retryAction}</span>
          </Button>
        )}
      </div>
    );
  }

  const { answer, unavailableSources } = message;
  const showPartialWarning = answer.evidenceStatus === "partial";
  const showInsufficientWarning = answer.evidenceStatus === "insufficient";

  return (
    <div className="self-start flex max-w-[85%] flex-col gap-2.5" data-testid="chat-message-assistant">
      <div className="border-s-2 border-primary ps-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">مِسناد</p>
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">{answer.answer}</p>
      </div>

      {(showPartialWarning || showInsufficientWarning) && (
        <div className="flex items-start gap-2 rounded-md border border-v2-warning/25 bg-v2-warning/5 px-3 py-2" data-testid={`chat-evidence-warning-${answer.evidenceStatus}`}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-v2-warning-foreground" />
          <p className="text-xs leading-relaxed text-v2-warning-foreground">
            {showInsufficientWarning ? copy.evidenceInsufficientWarning : copy.evidencePartialWarning}
          </p>
        </div>
      )}

      {answer.citations.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="chat-message-citations">
          {answer.citations.map((citation, index) => (
            <AdvisorCitation key={`${citation.source}-${index}`} citation={citation} language={language} />
          ))}
        </div>
      )}

      {unavailableSources.length > 0 && (
        <div className="rounded-md border border-border bg-muted/50 px-3 py-2" data-testid="chat-unavailable-sources">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {copy.unavailableSourcesPrefix}{" "}
            {UNAVAILABLE_SOURCE_ORDER.filter((source) => unavailableSources.includes(source))
              .map((source) => copy.unavailableSourceLabels[source])
              .join(language === "ar" ? "، " : ", ")}
          </p>
        </div>
      )}
    </div>
  );
}
