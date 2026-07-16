import { useEffect, useRef, useState } from "react";
import { Info, Sparkles } from "lucide-react";
import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult } from "@/types/analysis";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { buildChatRequestPayload, canSendQuestion, sendChatMessage } from "@/lib/chatApi";
import { getSuggestedQuestions } from "@/lib/suggestedQuestions";
import type { ChatMessage as ChatMessageType } from "@/lib/chatTypes";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import ChatLoadingState from "./ChatLoadingState";
import ChatSuggestedQuestions from "./ChatSuggestedQuestions";

function generateMessageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * "Ask Misnad" — the grounded contract-assistant chat. Only ever active
 * after a successful contract analysis (this component is only ever
 * mounted from within the results tabs, which already require a
 * successful `analysis`). When `contractRagSessionId` is null (Contract
 * RAG indexing failed/was unavailable for this analysis), contract
 * questions won't be well-grounded, so a clear notice is shown — but the
 * input stays enabled, since general/legal/financial questions can still
 * work (the server decides the actual route; this component never
 * disables based on a guess about what the question needs).
 *
 * State is plain `useState` (messages/input/isSending), matching every
 * other results-tab component in this app (`PersonalizedAnalysisSection`,
 * `LoadingScreen`) — no reducer, no new state-management library. The
 * conversation lives only in this component's memory: it is never sent to
 * any persistence endpoint, and it resets whenever this component
 * unmounts (a new analysis) or `contractRagSessionId` changes while
 * mounted.
 */
export default function ContractChat({
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

  // Explicit, direct reset — never relies solely on this component
  // happening to unmount when the session changes (see the requirement
  // that the chat clears whenever `contractRagSessionId` changes).
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
    if (!canSendQuestion(rawQuestion, isSending)) {
      return;
    }
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
        ? {
            id: generateMessageId(),
            role: "assistant",
            answer: result.answer,
            unavailableSources: result.unavailableSources,
            timestamp: Date.now(),
          }
        : {
            id: generateMessageId(),
            role: "error",
            code: result.code,
            message: result.message,
            retryable: result.retryable,
            retryQuestion: question,
            timestamp: Date.now(),
          },
    ]);
    setIsSending(false);
  }

  function handleSendFromInput() {
    if (!canSendQuestion(input, isSending)) {
      return;
    }
    const question = input;
    setInput("");
    void submitQuestion(question);
  }

  const suggested = getSuggestedQuestions(contractType, language);
  const showSuggested = messages.length === 0 && !isSending;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="flex flex-col gap-4" data-testid="contract-chat">
      <div className="flex items-start gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-3">
        <Sparkles size={15} className="text-indigo-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-muted-foreground leading-relaxed" data-testid="chat-disclaimer">
          {copy.disclaimer}
        </p>
      </div>

      {!contractRagSessionId && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3" data-testid="chat-session-unavailable-notice">
          <Info size={15} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-200/90 leading-relaxed">{copy.sessionUnavailableNotice}</p>
        </div>
      )}

      <div className="flex flex-col gap-3" data-testid="chat-message-list">
        {messages.length === 0 && !isSending && (
          <p className="text-[13px] text-muted-foreground text-center py-6" data-testid="chat-empty-hint">
            {copy.emptyStateHint}
          </p>
        )}
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} language={language} onRetry={(question) => void submitQuestion(question)} />
        ))}
        {isSending && <ChatLoadingState language={language} />}
        <div ref={bottomRef} />
      </div>

      {showSuggested && (
        <ChatSuggestedQuestions questions={suggested} language={language} disabled={isSending} onSelect={(question) => void submitQuestion(question)} />
      )}

      <div className="sticky bottom-0 -mx-6 px-6 pt-2 pb-1 bg-[#0D1117]/95 backdrop-blur-md border-t border-white/5">
        <ChatInput
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
