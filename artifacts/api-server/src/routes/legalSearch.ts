import { Router, type IRouter, type Request, type Response } from "express";
import {
  GeminiEmbeddingProvider,
  legalSearchRequestSchema,
  PostgresLegalChunkRepository,
  retrieveLegalContext,
  type EmbeddingProvider,
  type LegalChunkRepository,
  type LegalSearchQuery,
  type LegalSearchResponse,
} from "@workspace/legal-rag";

const router: IRouter = Router();

/**
 * Injectable so tests can exercise this route against
 * `InMemoryLegalChunkRepository` + `FakeEmbeddingProvider` — never a live
 * database or a real Gemini call. Production code never passes this; the
 * real Postgres/Gemini implementations are the default, exactly like every
 * other route in this file's sibling routes.
 */
export interface LegalSearchHandlerDeps {
  repository: LegalChunkRepository;
  embeddingProvider: EmbeddingProvider;
}

const defaultDeps: LegalSearchHandlerDeps = {
  repository: new PostgresLegalChunkRepository(),
  embeddingProvider: new GeminiEmbeddingProvider(),
};

/**
 * Retrieval-only endpoint: returns grounded, cited official-source excerpts
 * for a legal search question. Never asks an LLM to compose a final legal
 * answer — that is the future chat/answer-composer layer's job, not this
 * one. A request that matches nothing defensible returns
 * `status: "insufficient_source"` with an empty result array, never a weak
 * unrelated match forced into the response.
 */
export async function handleLegalSearch(
  req: Request,
  res: Response,
  deps: LegalSearchHandlerDeps = defaultDeps,
): Promise<void> {
  const parsedRequest = legalSearchRequestSchema.safeParse(req.body);
  if (!parsedRequest.success) {
    res.status(400).json({
      success: false,
      message: "Request payload is missing or does not match the expected shape.",
    });
    return;
  }

  const { query, contractType, topics, topK } = parsedRequest.data;
  const searchQuery: LegalSearchQuery = {
    query,
    contractType,
    topics,
    topK,
  };

  try {
    const result = await retrieveLegalContext(searchQuery, deps);
    const response: LegalSearchResponse & { success: true } = { success: true, ...result };
    res.json(response);
  } catch (err) {
    req.log.warn(
      { message: err instanceof Error ? err.message : String(err) },
      "Legal search retrieval failed",
    );
    res.status(422).json({
      success: false,
      message: "Legal search could not be completed.",
    });
  }
}

router.post("/legal-search", (req, res) => handleLegalSearch(req, res));

export default router;
