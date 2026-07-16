import { AlertTriangle, RotateCcw } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { ChatSourceKind } from "@workspace/chat-router";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import type { ChatMessage as ChatMessageType } from "@/lib/chatTypes";
import ChatCitation from "./ChatCitation";

const UNAVAILABLE_SOURCE_ORDER: ChatSourceKind[] = ["contract", "legal", "financial"];

/**
 * Renders one message of any role. Deliberately never renders
 * `answer.route`, `answer.confidence`, `answer.provider`, or
 * `answer.model` — per this feature's requirement, route/evidence-status
 * are only ever surfaced as the two plain-language warning strings below,
 * and provider/model are never shown to normal users at all.
 */
export default function ChatMessage({
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
      <div
        className="self-end max-w-[85%] rounded-2xl rounded-ee-sm bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] px-4 py-2.5 text-white text-[13px] leading-relaxed whitespace-pre-wrap break-words"
        data-testid="chat-message-user"
      >
        {message.text}
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div
        className="self-start max-w-[85%] rounded-2xl rounded-ss-sm bg-red-500/10 border border-red-500/20 px-4 py-3 flex flex-col gap-2"
        data-testid="chat-message-error"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-[13px] text-red-200 leading-relaxed">{message.message}</p>
        </div>
        {message.retryable && (
          <button
            type="button"
            onClick={() => onRetry(message.retryQuestion)}
            data-testid="chat-message-retry"
            className="self-start inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-white/10 hover:bg-white/15 rounded-full px-3 py-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 transition-colors"
          >
            <RotateCcw size={12} />
            <span>{copy.retryAction}</span>
          </button>
        )}
      </div>
    );
  }

  const { answer, unavailableSources } = message;
  const showPartialWarning = answer.evidenceStatus === "partial";
  const showInsufficientWarning = answer.evidenceStatus === "insufficient";

  return (
    <div className="self-start max-w-[85%] flex flex-col gap-2" data-testid="chat-message-assistant">
      <div className="rounded-2xl rounded-ss-sm bg-white/5 border border-white/10 px-4 py-2.5 text-white text-[13px] leading-relaxed whitespace-pre-wrap break-words">
        {answer.answer}
      </div>

      {(showPartialWarning || showInsufficientWarning) && (
        <div
          className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2"
          data-testid={`chat-evidence-warning-${answer.evidenceStatus}`}
        >
          <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-200/90 leading-relaxed">
            {showInsufficientWarning ? copy.evidenceInsufficientWarning : copy.evidencePartialWarning}
          </p>
        </div>
      )}

      {answer.citations.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="chat-message-citations">
          {answer.citations.map((citation, index) => (
            <ChatCitation key={`${citation.source}-${index}`} citation={citation} language={language} />
          ))}
        </div>
      )}

      {unavailableSources.length > 0 && (
        <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2" data-testid="chat-unavailable-sources">
          <p className="text-[12px] text-muted-foreground leading-relaxed">
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
