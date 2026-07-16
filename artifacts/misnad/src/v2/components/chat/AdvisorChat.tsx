import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult } from "@/types/analysis";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { buildChatRequestPayload, canSendQuestion, sendChatMessage } from "@/lib/chatApi";
import { getSuggestedQuestions } from "@/lib/suggestedQuestions";
import type { ChatMessage as ChatMessageType } from "@/lib/chatTypes";
import AdvisorMessage from "./AdvisorMessage";
import AdvisorInput from "./AdvisorInput";
import AdvisorLoadingState from "./AdvisorLoadingState";
import AdvisorSuggestedQuestions from "./AdvisorSuggestedQuestions";

function generateMessageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * "Ask Misnad" restyled as an advisor note thread rather than a chatbot —
 * same exact state machine, request payload, and API contract as V1's
 * `ContractChat.tsx` (see `chatApi.ts`/`chatTypes.ts`/`suggestedQuestions.ts`,
 * all unchanged): messages/input/isSending in local `useState`, resets on
 * `contractRagSessionId` change, never persisted.
 */
export default function AdvisorChat({
  language,
  contractType,
  contractRagSessionId,
  analysis,
  financialMetrics,
}: {
  language: AnalysisLanguage;
  contractType: ContractType;
  contractRagSessionId: string | null;
  analysis: ContractAnalysisResult | null;
  financialMetrics: FinancialMetrics | null;
}) {
  const copy = RESULTS_COPY[language].chat;
  const isAr = language === "ar";

  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages([]);
    setInput("");
    setIsSending(false);
  }, [contractRagSessionId]);

  useEffect(() => {
    if (messages.length > 0 || isSending) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, isSending]);

  async function submitQuestion(rawQuestion: string) {
    if (!canSendQuestion(rawQuestion, isSending)) return;
    const question = rawQuestion.trim();

    setMessages((prev) => [...prev, { id: generateMessageId(), role: "user", text: question, timestamp: Date.now() }]);
    setIsSending(true);

    const payload = buildChatRequestPayload({
      question,
      contractRagSessionId,
      selectedContractType: contractType,
      answerLanguage: language,
      financialMetrics,
      contractAnalysis: analysis,
    });

    const result = await sendChatMessage(payload, language);

    setMessages((prev) => [
      ...prev,
      result.ok
        ? { id: generateMessageId(), role: "assistant", answer: result.answer, unavailableSources: result.unavailableSources, timestamp: Date.now() }
        : { id: generateMessageId(), role: "error", code: result.code, message: result.message, retryable: result.retryable, retryQuestion: question, timestamp: Date.now() },
    ]);
    setIsSending(false);
  }

  function handleSendFromInput() {
    if (!canSendQuestion(input, isSending)) return;
    const question = input;
    setInput("");
    void submitQuestion(question);
  }

  const suggested = getSuggestedQuestions(contractType, language);
  const showSuggested = messages.length === 0 && !isSending;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="flex flex-col gap-4" data-testid="contract-chat">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3">
        <Info size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-sm leading-relaxed text-muted-foreground" data-testid="chat-disclaimer">
          {copy.disclaimer}
        </p>
      </div>

      {!contractRagSessionId && (
        <div className="flex items-start gap-2 rounded-md border border-v2-warning/25 bg-v2-warning/5 p-3" data-testid="chat-session-unavailable-notice">
          <Info size={15} className="mt-0.5 shrink-0 text-v2-warning-foreground" />
          <p className="text-sm leading-relaxed text-v2-warning-foreground">{copy.sessionUnavailableNotice}</p>
        </div>
      )}

      <div className="flex flex-col gap-3" data-testid="chat-message-list">
        {messages.length === 0 && !isSending && (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="chat-empty-hint">
            {copy.emptyStateHint}
          </p>
        )}
        {messages.map((message) => (
          <AdvisorMessage key={message.id} message={message} language={language} onRetry={(question) => void submitQuestion(question)} />
        ))}
        {isSending && <AdvisorLoadingState language={language} />}
        <div ref={bottomRef} />
      </div>

      {showSuggested && (
        <AdvisorSuggestedQuestions questions={suggested} language={language} disabled={isSending} onSelect={(question) => void submitQuestion(question)} />
      )}

      <div className="sticky bottom-0 -mx-6 border-t border-border bg-background/95 px-6 pb-1 pt-2 backdrop-blur-sm">
        <AdvisorInput
          value={input}
          onChange={setInput}
          onSend={handleSendFromInput}
          disabled={isSending}
          canSend={canSendQuestion(input, isSending)}
          language={language}
        />
      </div>
    </div>
  );
}
