import {
  contractSearchRequestSchema,
  PostgresContractRagRepository,
  retrieveContractContext,
  type ContractRagRepository,
} from "@workspace/contract-rag";
import { GeminiEmbeddingProvider, type EmbeddingProvider } from "@workspace/legal-rag";
import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

/**
 * Injectable so tests can exercise this route against
 * `InMemoryContractRagRepository` + `FakeEmbeddingProvider` — never a live
 * database or a real Gemini call. Production code never passes this; the
 * real Postgres/Gemini implementations are the default, exactly like
 * `legalSearch.ts`'s sibling route.
 */
export interface ContractSearchHandlerDeps {
  repository: ContractRagRepository;
  embeddingProvider: EmbeddingProvider;
}

const defaultDeps: ContractSearchHandlerDeps = {
  repository: new PostgresContractRagRepository(),
  embeddingProvider: new GeminiEmbeddingProvider({ context: "contractSearch" }),
};

/**
 * Retrieval-only endpoint: returns contract evidence for one session's own
 * masked chunks. Never composes a final chat answer — that is the future
 * chat/answer-composer layer's job, not this one. An expired, nonexistent,
 * or otherwise inaccessible session always maps to the same
 * `contract_session_unavailable` status, never revealing which case
 * applies. A query that matches nothing defensible returns
 * `insufficient_contract_context`, never a padded/unrelated result.
 */
export async function handleContractSearch(
  req: Request,
  res: Response,
  deps: ContractSearchHandlerDeps = defaultDeps,
): Promise<void> {
  const parsedRequest = contractSearchRequestSchema.safeParse(req.body);
  if (!parsedRequest.success) {
    res.status(400).json({
      success: false,
      message: "Request payload is missing or does not match the expected shape.",
    });
    return;
  }

  const { sessionId, query, language, topK, selectedClauseTitle } = parsedRequest.data;

  try {
    const result = await retrieveContractContext(
      { sessionId, query, language, topK, selectedClauseTitle },
      deps,
    );

    const status = result.status === "session_unavailable" ? "contract_session_unavailable" : result.status;
    res.json({ success: true, status, results: result.results });
  } catch (err) {
    req.log.warn(
      { message: err instanceof Error ? err.message : String(err) },
      "Contract search retrieval failed",
    );
    res.status(422).json({
      success: false,
      message: "Contract search could not be completed.",
    });
  }
}

router.post("/contract-search", (req, res) => handleContractSearch(req, res));

export default router;
