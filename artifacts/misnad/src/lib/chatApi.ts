import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import { MAX_QUESTION_LENGTH } from "@workspace/chat-router";
import type { ContractAnalysisResult } from "@/types/analysis";
import { toApiLanguage, type ChatRequestPayload, type ChatRoute, type ChatSourceKind, type ComposedAnswer, type SendChatMessageResult } from "./chatTypes";

export { MAX_QUESTION_LENGTH };

export function isQuestionEmpty(question: string): boolean {
  return question.trim().length === 0;
}

export function isQuestionOverLimit(question: string): boolean {
  return question.length > MAX_QUESTION_LENGTH;
}

export function remainingQuestionCharacters(question: string): number {
  return MAX_QUESTION_LENGTH - question.length;
}

/** The single gate every send path (typed question, suggested question, retry) must pass — never bypassed by any caller. */
export function canSendQuestion(question: string, isSending: boolean): boolean {
  return !isSending && !isQuestionEmpty(question) && !isQuestionOverLimit(question);
}

export interface BuildChatRequestPayloadParams {
  question: string;
  contractRagSessionId: string | null;
  selectedContractType: ContractType;
  answerLanguage: AnalysisLanguage;
  financialMetrics: FinancialMetrics | null;
  contractAnalysis: ContractAnalysisResult | null;
}

/**
 * Builds EXACTLY the fields `POST /api/contract-chat` accepts — see
 * `ChatRequestPayload`'s own doc-comment. A `null`/absent optional value is
 * never sent as an explicit `null` — it's omitted entirely, matching the
 * API's own `.optional()` (not `.nullable()`) schema fields. There is no
 * code path here that could add a `route`, `requiredSources`, a citation
 * URL, a chunk id, or any raw/masked text field — the return type itself
 * has no room for them.
 */
export function buildChatRequestPayload(params: BuildChatRequestPayloadParams): ChatRequestPayload {
  const payload: ChatRequestPayload = {
    question: params.question,
    selectedContractType: params.selectedContractType,
    answerLanguage: toApiLanguage(params.answerLanguage),
  };

  if (params.contractRagSessionId) {
    payload.contractRagSessionId = params.contractRagSessionId;
  }
  if (params.financialMetrics) {
    payload.financialMetrics = params.financialMetrics;
  }
  if (params.contractAnalysis) {
    payload.contractAnalysis = params.contractAnalysis;
  }

  return payload;
}

const GENERIC_ERROR_COPY: Record<AnalysisLanguage, string> = {
  ar: "حدث خطأ غير متوقع. حاول مرة أخرى.",
  en: "Something unexpected happened. Please try again.",
};

function isWellFormedChatResponse(value: unknown): value is { success: boolean } {
  return typeof value === "object" && value !== null && "success" in value && typeof (value as { success: unknown }).success === "boolean";
}

/**
 * The single call site for `POST /api/contract-chat`. Never surfaces a raw
 * exception message, a raw fetch/network error, or an unparsed response
 * body — every failure path resolves to either the server's own
 * already-sanitized, already-bilingual `error.message`, or this module's
 * own generic fallback string. There is no code path that could echo a
 * stack trace, a provider payload, or an internal error code's raw text.
 */
export async function sendChatMessage(payload: ChatRequestPayload, language: AnalysisLanguage): Promise<SendChatMessageResult> {
  let body: unknown;
  try {
    const res = await fetch("/api/contract-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    body = await res.json().catch(() => null);
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: GENERIC_ERROR_COPY[language], retryable: true };
  }

  if (!isWellFormedChatResponse(body)) {
    return { ok: false, code: "INTERNAL_ERROR", message: GENERIC_ERROR_COPY[language], retryable: true };
  }

  if (body.success === true) {
    const success = body as unknown as { answer: ComposedAnswer; route: ChatRoute; unavailableSources: ChatSourceKind[]; warnings: string[] };
    return { ok: true, answer: success.answer, route: success.route, unavailableSources: success.unavailableSources ?? [], warnings: success.warnings ?? [] };
  }

  const failure = body as unknown as { error?: { code?: unknown; message?: unknown; retryable?: unknown } };
  const code = typeof failure.error?.code === "string" ? failure.error.code : "INTERNAL_ERROR";
  const message = typeof failure.error?.message === "string" ? failure.error.message : GENERIC_ERROR_COPY[language];
  const retryable = typeof failure.error?.retryable === "boolean" ? failure.error.retryable : false;

  return { ok: false, code, message, retryable };
}
