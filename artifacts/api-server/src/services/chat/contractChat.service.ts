import type { AnalysisLanguage } from "@workspace/contract-types";
import { routeChatQuestion, type ChatRoute, type ChatSourceKind } from "@workspace/chat-router";
import {
  buildGroundedContext,
  type ContractRetrieverDeps,
  type GroundedContext,
  type LegalRetrieverDeps,
} from "@workspace/context-builder";
import { composeAnswer, type ComposeAnswerOptions, type ComposedAnswer } from "@workspace/answer-composer";
import { PostgresContractRagRepository } from "@workspace/contract-rag";
import { GeminiEmbeddingProvider, PostgresLegalChunkRepository } from "@workspace/legal-rag";
import type { ContractChatRequest } from "../../schemas/contractChat.schema";
import { ContextRetrievalError, ContractChatTimeoutError } from "./chatErrorMapper";

export const DEFAULT_CONTRACT_CHAT_TIMEOUT_MS = 30_000;

/**
 * Injectable so tests can supply `InMemoryContractRagRepository` /
 * `InMemoryLegalChunkRepository` + `FakeEmbeddingProvider` and a mocked
 * `composeAnswerOptions.provider` — never a live database or a real Gemini
 * call. Production code never passes any of these; the real
 * Postgres/Gemini implementations are the defaults, matching every other
 * route in this package.
 */
export interface ContractChatServiceDeps {
  contractRag?: ContractRetrieverDeps;
  legalRag?: LegalRetrieverDeps;
  composeAnswerOptions?: ComposeAnswerOptions;
  /** Overridable purely for tests — production always uses the real env-var-presence check. */
  isLegalRagConfigured?: () => boolean;
  timeoutMs?: number;
}

export interface ContractChatResult {
  answer: ComposedAnswer;
  route: ChatRoute;
  unavailableSources: ChatSourceKind[];
  warnings: string[];
}

function toAnalysisLanguage(language: "AR" | "EN"): AnalysisLanguage {
  return language === "AR" ? "ar" : "en";
}

/**
 * "Available" here means "configured to be usable" — a synchronous,
 * no-network-call check (presence of the database and Gemini
 * configuration Legal RAG's own retrieval depends on), never a live ping.
 * A configured-but-momentarily-unreachable database still surfaces as a
 * thrown error from `buildGroundedContext`, handled separately (see
 * `ContextRetrievalError`) — this flag only answers "should we even
 * attempt it".
 */
function defaultIsLegalRagConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL) && Boolean(process.env.GEMINI_API_KEY);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ContractChatTimeoutError()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Orchestrates the full grounded contract chat pipeline for one already
 * schema-validated request: Chat Router → Grounded Context Builder →
 * Grounded Answer Composer. The route and required sources are always
 * decided by `routeChatQuestion` alone — nothing here (and nothing the
 * client sends) can override `route` or which sources it requires; this
 * function only supplies the three availability booleans the router asks
 * for and passes its decision straight through to `buildGroundedContext`.
 *
 * Wrapped in a timeout (see `withTimeout`) as a safety net against a slow
 * database or provider call — this is a race, not a true cancellation: the
 * underlying repository/provider call may continue running in the
 * background after a `ContractChatTimeoutError` is thrown, since none of
 * the reused packages expose an abort signal (adding one would mean
 * modifying already-complete packages, out of scope for this milestone).
 */
export async function runContractChat(request: ContractChatRequest, deps: ContractChatServiceDeps = {}): Promise<ContractChatResult> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_CONTRACT_CHAT_TIMEOUT_MS;
  return withTimeout(executeContractChat(request, deps), timeoutMs);
}

async function executeContractChat(request: ContractChatRequest, deps: ContractChatServiceDeps): Promise<ContractChatResult> {
  const answerLanguage = toAnalysisLanguage(request.answerLanguage);

  // Step 2: source availability — each flag reflects only what this single
  // request can legitimately use, never a client-asserted claim about
  // routing itself.
  const contractRagAvailable = Boolean(request.contractRagSessionId);
  const legalRagAvailable = (deps.isLegalRagConfigured ?? defaultIsLegalRagConfigured)();
  const financialMetricsAvailable = Boolean(request.financialMetrics);

  // Step 3: the router — the sole authority on `route` and required sources.
  const routeDecision = routeChatQuestion({
    question: request.question,
    contractType: request.selectedContractType,
    answerLanguage,
    contractRagAvailable,
    legalRagAvailable,
    financialMetricsAvailable,
  });

  const contractRagDeps: ContractRetrieverDeps =
    deps.contractRag ?? { repository: new PostgresContractRagRepository(), embeddingProvider: new GeminiEmbeddingProvider() };
  const legalRagDeps: LegalRetrieverDeps =
    deps.legalRag ?? { repository: new PostgresLegalChunkRepository(), embeddingProvider: new GeminiEmbeddingProvider() };

  // Step 4: the grounded context — built only from the router's own
  // decision and the already-validated request data (contractRagSessionId,
  // contractAnalysis, financialMetrics). A thrown error here is always a
  // genuine infrastructure failure (e.g. a database connection error) —
  // the normal "session doesn't exist"/"nothing relevant found" outcomes
  // are already handled gracefully inside `buildGroundedContext` itself
  // (empty evidence arrays + warnings, never a throw).
  let groundedContext: GroundedContext;
  try {
    groundedContext = await buildGroundedContext(
      {
        routeDecision,
        question: request.question,
        contractRagSessionId: request.contractRagSessionId ?? null,
        contractType: request.selectedContractType,
        answerLanguage,
        contractAnalysis: request.contractAnalysis ?? null,
        financialMetrics: request.financialMetrics ?? null,
      },
      { contractRag: contractRagDeps, legalRag: legalRagDeps },
    );
  } catch (error) {
    // Best-effort source attribution from the route alone — see
    // `ContextRetrievalError`'s doc-comment for why this can only be a
    // guess, not a precise diagnosis, for a route needing both sources.
    const requiresContract = routeDecision.requiredSources.some((entry) => entry.source === "contract");
    throw new ContextRetrievalError(requiresContract ? "contract" : "legal", error);
  }

  // Step 5: the composer — never retrieves anything itself, only consumes
  // the grounded context just built.
  const answer = await composeAnswer(groundedContext, deps.composeAnswerOptions);

  return {
    answer,
    route: routeDecision.route,
    unavailableSources: routeDecision.unavailableRequiredSources,
    warnings: answer.warnings,
  };
}
