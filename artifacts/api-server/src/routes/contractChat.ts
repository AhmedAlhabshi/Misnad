import { Router, type IRouter, type Request, type Response } from "express";
import { contractChatRequestSchema } from "../schemas/contractChat.schema";
import { buildErrorResponse, mapContractChatError } from "../services/chat/chatErrorMapper";
import { runContractChat, type ContractChatServiceDeps } from "../services/chat/contractChat.service";

const router: IRouter = Router();

/**
 * Injectable so tests can exercise this route against in-memory
 * repositories + fake embedding providers + a mocked answer-composer
 * provider — never a live database or a real Gemini/OpenRouter call.
 * Production code never passes this; `runContractChat`'s own defaults
 * (the real Postgres/Gemini implementations) apply, exactly like every
 * other route in this file's sibling routes.
 */
export type ContractChatHandlerDeps = ContractChatServiceDeps;

/** Best-effort language for an error message when the request body itself failed validation — never trusted for anything beyond picking AR vs EN wording. */
function pickErrorLanguage(rawBody: unknown): "AR" | "EN" {
  if (rawBody && typeof rawBody === "object" && "answerLanguage" in rawBody) {
    const value = (rawBody as { answerLanguage?: unknown }).answerLanguage;
    if (value === "AR") return "AR";
  }
  return "EN";
}

/**
 * `POST /api/contract-chat` — orchestrates Chat Router → Grounded Context
 * Builder → Grounded Answer Composer for one already-analyzed contract.
 * Never accepts raw or masked contract text (the request schema is
 * `.strict()`, so any such field is rejected as a 400 before this handler
 * even runs); never retrieves Contract RAG chunks outside the existing
 * session-scoped retrieval path; never lets the client choose the route or
 * which sources are required — both are decided entirely by
 * `routeChatQuestion` inside `runContractChat`.
 *
 * Diagnostics logged here are deliberately restricted to safe,
 * non-content fields (event, route, language, contract type, evidence
 * counts, unavailable sources, provider name, duration, sanitized error
 * code) — the question text, any excerpt, any financial value, the raw
 * model response, prompts, and API keys are never logged, matching this
 * milestone's explicit diagnostics policy.
 */
export async function handleContractChat(req: Request, res: Response, deps: ContractChatHandlerDeps = {}): Promise<void> {
  const startedAt = Date.now();
  const parsedRequest = contractChatRequestSchema.safeParse(req.body);

  if (!parsedRequest.success) {
    const language = pickErrorLanguage(req.body);
    const { httpStatus, body } = buildErrorResponse("INVALID_REQUEST", language);
    req.log.warn({ event: "contract_chat_invalid_request", durationMs: Date.now() - startedAt }, "contract chat request failed validation");
    res.status(httpStatus).json(body);
    return;
  }

  const request = parsedRequest.data;

  try {
    const result = await runContractChat(request, deps);

    req.log.info(
      {
        event: "contract_chat_completed",
        route: result.route,
        language: request.answerLanguage,
        contractType: request.selectedContractType,
        evidenceCounts: {
          citations: result.answer.citations.length,
          financialFactKeys: result.answer.usedFinancialFactKeys.length,
        },
        unavailableSources: result.unavailableSources,
        provider: result.answer.provider,
        confidence: result.answer.confidence,
        evidenceStatus: result.answer.evidenceStatus,
        durationMs: Date.now() - startedAt,
      },
      "contract chat completed",
    );

    res.json({
      success: true,
      answer: result.answer,
      route: result.route,
      unavailableSources: result.unavailableSources,
      warnings: result.warnings,
    });
  } catch (error) {
    const mapped = mapContractChatError(error, request.answerLanguage);

    req.log.warn(
      {
        event: "contract_chat_failed",
        code: mapped.code,
        language: request.answerLanguage,
        contractType: request.selectedContractType,
        durationMs: Date.now() - startedAt,
      },
      "contract chat failed",
    );

    res.status(mapped.httpStatus).json({
      success: false,
      error: { code: mapped.code, message: mapped.message, retryable: mapped.retryable },
    });
  }
}

router.post("/contract-chat", (req, res) => handleContractChat(req, res));

export default router;
