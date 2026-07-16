import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import type { ChatRoute, ChatSourceKind } from "@workspace/chat-router";
import type { ComposedAnswer } from "@workspace/answer-composer";
import type { ContractAnalysisResult } from "@/types/analysis";

/** Re-exported so every chat module imports these from one place rather than reaching into the backend packages directly. */
export type { ChatRoute, ChatSourceKind, ComposedAnswer };

/**
 * Exactly the fields `POST /api/contract-chat` accepts — see
 * `@workspace/api-server`'s `contractChat.schema.ts` (`.strict()`, so any
 * other field is rejected outright). Never a route, requiredSources,
 * citation URL, chunk id, or raw/masked contract text — this type simply
 * has no room for any of those.
 */
export interface ChatRequestPayload {
  question: string;
  contractRagSessionId?: string;
  selectedContractType: ContractType;
  answerLanguage: "AR" | "EN";
  financialMetrics?: FinancialMetrics;
  contractAnalysis?: ContractAnalysisResult;
}

export interface ChatSuccessResult {
  ok: true;
  answer: ComposedAnswer;
  route: ChatRoute;
  unavailableSources: ChatSourceKind[];
  warnings: string[];
}

export interface ChatFailureResult {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
}

export type SendChatMessageResult = ChatSuccessResult | ChatFailureResult;

export interface UserChatMessage {
  id: string;
  role: "user";
  text: string;
  timestamp: number;
}

export interface AssistantChatMessage {
  id: string;
  role: "assistant";
  answer: ComposedAnswer;
  unavailableSources: ChatSourceKind[];
  timestamp: number;
}

export interface ErrorChatMessage {
  id: string;
  role: "error";
  code: string;
  message: string;
  retryable: boolean;
  /** The original question text, kept only so a retry can resend it — never displayed as a second copy of the user's bubble. */
  retryQuestion: string;
  timestamp: number;
}

export type ChatMessage = UserChatMessage | AssistantChatMessage | ErrorChatMessage;

/** Frontend-only convenience wrapper — never sent to the API and never derived from anything the API returns beyond `answer.language`. */
export function toApiLanguage(language: AnalysisLanguage): "AR" | "EN" {
  return language === "ar" ? "AR" : "EN";
}
