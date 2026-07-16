import { ComposerError, ContractAnalysisError } from "@workspace/answer-composer";
import type { ContractChatErrorCode } from "../../schemas/contractChat.schema";

/** Thrown by `contractChat.service.ts` itself (never by any reused package) purely as a request-level timeout signal — see that service's timeout wrapper. */
export class ContractChatTimeoutError extends Error {
  constructor() {
    super("The contract chat request timed out.");
    this.name = "ContractChatTimeoutError";
  }
}

/**
 * Thrown by `contractChat.service.ts` when `buildGroundedContext` itself
 * throws (a genuine, unexpected infrastructure failure — e.g. a database
 * connection error from the Contract RAG / Legal RAG repository — as
 * opposed to the normal, graceful "session unavailable" / "no results"
 * outcomes those retrievers already handle without throwing). `sourceHint`
 * is a best-effort guess at which evidence source was being fetched when
 * the exception surfaced, derived from the route alone (see
 * `contractChat.service.ts` for exactly how) — `@workspace/context-builder`
 * itself is never modified to add per-source error tagging, per this
 * milestone's "do not redesign existing packages" constraint, so a route
 * that needs both contract and legal evidence can only get an
 * approximate guess, documented as a known limitation.
 */
export class ContextRetrievalError extends Error {
  public readonly sourceHint: "contract" | "legal";

  constructor(sourceHint: "contract" | "legal", cause: unknown) {
    super("Grounded context retrieval failed.");
    this.name = "ContextRetrievalError";
    this.sourceHint = sourceHint;
    this.cause = cause;
  }
}

export interface MappedChatError {
  httpStatus: number;
  code: ContractChatErrorCode;
  message: string;
  retryable: boolean;
}

const ERROR_MESSAGES: Record<ContractChatErrorCode, { EN: string; AR: string }> = {
  INVALID_REQUEST: {
    EN: "Your request could not be understood. Please check your input and try again.",
    AR: "تعذّر فهم طلبك. يرجى التحقق من المدخلات والمحاولة مرة أخرى.",
  },
  INVALID_SESSION: {
    EN: "The contract session reference is not valid.",
    AR: "مرجع جلسة العقد غير صالح.",
  },
  SESSION_EXPIRED: {
    EN: "Your contract session is no longer available. Please re-upload the contract.",
    AR: "لم تعد جلسة العقد متاحة. يرجى إعادة رفع العقد.",
  },
  CONTRACT_CONTEXT_UNAVAILABLE: {
    EN: "We couldn't access your contract right now. Please try again shortly.",
    AR: "تعذّر الوصول إلى عقدك حالياً. يرجى المحاولة مرة أخرى بعد قليل.",
  },
  LEGAL_RETRIEVAL_UNAVAILABLE: {
    EN: "We couldn't reach the legal reference service right now. Please try again shortly.",
    AR: "تعذّر الوصول إلى خدمة المراجع النظامية حالياً. يرجى المحاولة مرة أخرى بعد قليل.",
  },
  PROVIDER_RATE_LIMITED: {
    EN: "Our AI service is busy right now. Please try again in a moment.",
    AR: "خدمة الذكاء الاصطناعي مشغولة حالياً. يرجى المحاولة بعد لحظات.",
  },
  PROVIDER_UNAVAILABLE: {
    EN: "Our AI service is temporarily unavailable. Please try again shortly.",
    AR: "خدمة الذكاء الاصطناعي غير متاحة مؤقتاً. يرجى المحاولة مرة أخرى بعد قليل.",
  },
  ANSWER_GENERATION_FAILED: {
    EN: "We couldn't generate an answer this time. Please try again.",
    AR: "تعذّر إنشاء إجابة هذه المرة. يرجى المحاولة مرة أخرى.",
  },
  REQUEST_TIMEOUT: {
    EN: "The request took too long to complete. Please try again.",
    AR: "استغرق الطلب وقتاً طويلاً. يرجى المحاولة مرة أخرى.",
  },
  INTERNAL_ERROR: {
    EN: "Something went wrong on our end. Please try again later.",
    AR: "حدث خطأ من جانبنا. يرجى المحاولة لاحقاً.",
  },
};

const HTTP_STATUS: Record<ContractChatErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_SESSION: 400,
  SESSION_EXPIRED: 400,
  CONTRACT_CONTEXT_UNAVAILABLE: 422,
  LEGAL_RETRIEVAL_UNAVAILABLE: 422,
  PROVIDER_RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 422,
  ANSWER_GENERATION_FAILED: 422,
  REQUEST_TIMEOUT: 504,
  INTERNAL_ERROR: 500,
};

/** Whether re-issuing the same request might succeed without the client changing anything — never implies retrying will fix a request-shape problem. */
const RETRYABLE: Record<ContractChatErrorCode, boolean> = {
  INVALID_REQUEST: false,
  INVALID_SESSION: false,
  SESSION_EXPIRED: false,
  CONTRACT_CONTEXT_UNAVAILABLE: true,
  LEGAL_RETRIEVAL_UNAVAILABLE: true,
  PROVIDER_RATE_LIMITED: true,
  PROVIDER_UNAVAILABLE: true,
  ANSWER_GENERATION_FAILED: true,
  REQUEST_TIMEOUT: true,
  INTERNAL_ERROR: false,
};

function buildMapped(code: ContractChatErrorCode, language: "AR" | "EN"): MappedChatError {
  return { httpStatus: HTTP_STATUS[code], code, message: ERROR_MESSAGES[code][language], retryable: RETRYABLE[code] };
}

export function buildErrorResponse(code: ContractChatErrorCode, language: "AR" | "EN"): { httpStatus: number; body: { success: false; error: { code: ContractChatErrorCode; message: string; retryable: boolean } } } {
  const mapped = buildMapped(code, language);
  return { httpStatus: mapped.httpStatus, body: { success: false, error: { code: mapped.code, message: mapped.message, retryable: mapped.retryable } } };
}

/**
 * The single place any error thrown anywhere in the contract-chat pipeline
 * is turned into a stable, safe, bilingual error response. Never includes
 * the original error's message, a stack trace, a provider payload, or an
 * API key — every message here is a static string from `ERROR_MESSAGES`,
 * chosen only by error *category*, never by echoing anything the
 * underlying error said.
 */
export function mapContractChatError(error: unknown, language: "AR" | "EN"): MappedChatError {
  if (error instanceof ContractChatTimeoutError) {
    return buildMapped("REQUEST_TIMEOUT", language);
  }

  if (error instanceof ContractAnalysisError) {
    if (error.code === "RATE_LIMITED") {
      return buildMapped("PROVIDER_RATE_LIMITED", language);
    }
    return buildMapped("PROVIDER_UNAVAILABLE", language);
  }

  if (error instanceof ComposerError) {
    if (error.code === "SCHEMA_VALIDATION_FAILED") {
      return buildMapped("ANSWER_GENERATION_FAILED", language);
    }
    // INVALID_GROUNDED_CONTEXT should never happen — this service always
    // builds the context itself from an already-validated request — but is
    // mapped defensively rather than falling through to INTERNAL_ERROR.
    return buildMapped("INVALID_REQUEST", language);
  }

  if (error instanceof ContextRetrievalError) {
    return buildMapped(error.sourceHint === "legal" ? "LEGAL_RETRIEVAL_UNAVAILABLE" : "CONTRACT_CONTEXT_UNAVAILABLE", language);
  }

  return buildMapped("INTERNAL_ERROR", language);
}
