import type { Request, Response } from "express";
import { generateContractRagSessionId, indexContractSession, InMemoryContractRagRepository, type ContractRagRepository } from "@workspace/contract-rag";
import {
  FakeEmbeddingProvider,
  GEMINI_EMBEDDING_DIMENSIONS,
  ingestSource,
  InMemoryLegalChunkRepository,
  LEGAL_SOURCE_MANIFEST,
  type EmbeddingProvider,
  type LegalChunkRepository,
} from "@workspace/legal-rag";
import { ContractAnalysisError, type ContractAnalysisProvider, type ContractAnalysisProviderResponse } from "@workspace/contract-analysis";
import type { ContractChatHandlerDeps } from "../contractChat";

export interface LoggedCall {
  level: "info" | "warn" | "error";
  obj: Record<string, unknown>;
  msg?: string;
}

export interface MockRequestHandle {
  req: Request;
  logs: LoggedCall[];
}

export function createMockReq(body: unknown): MockRequestHandle {
  const logs: LoggedCall[] = [];
  const req = {
    body,
    log: {
      info(obj: Record<string, unknown>, msg?: string) {
        logs.push({ level: "info", obj, msg });
      },
      warn(obj: Record<string, unknown>, msg?: string) {
        logs.push({ level: "warn", obj, msg });
      },
      error(obj: Record<string, unknown>, msg?: string) {
        logs.push({ level: "error", obj, msg });
      },
    },
  } as unknown as Request;
  return { req, logs };
}

export function createMockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

export async function setupContractRagFixture(maskedText: string): Promise<{
  repository: ContractRagRepository;
  embeddingProvider: EmbeddingProvider;
  sessionId: string;
}> {
  const repository = new InMemoryContractRagRepository();
  const embeddingProvider = new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS);
  const { sessionId } = await indexContractSession(
    { maskedDocument: { maskedText }, contractType: "auto_finance", analysisLanguage: "en" },
    { repository, embeddingProvider },
  );
  return { repository, embeddingProvider, sessionId };
}

export async function setupLegalRagFixture(): Promise<{ repository: LegalChunkRepository; embeddingProvider: EmbeddingProvider }> {
  const repository = new InMemoryLegalChunkRepository();
  const embeddingProvider = new FakeEmbeddingProvider(GEMINI_EMBEDDING_DIMENSIONS);
  await ingestSource("sama_regulations_consumer_financing", { repository, embeddingProvider, manifest: LEGAL_SOURCE_MANIFEST });
  return { repository, embeddingProvider };
}

export function anyValidSessionId(): string {
  return generateContractRagSessionId();
}

/**
 * A provider that never needs to know the real `GroundedContext` object —
 * it recovers exactly which citations/factKeys were actually offered by
 * reading them back out of the serialized prompt text itself (the same
 * text `@workspace/answer-composer`'s `contextSerializer.ts` always
 * writes), then echoes only those back. This lets one fixture provider
 * behave correctly for every route/evidence combination without hardcoding
 * fixture-specific values in each test.
 */
export function makeHonestMockProvider(answerText = "This is a test answer based on the supplied evidence."): ContractAnalysisProvider {
  return {
    async generate({ userPrompt }: { userPrompt: string }): Promise<ContractAnalysisProviderResponse> {
      const citations: Array<{ source: "contract" | "legal"; citation: string }> = [];
      for (const match of userPrompt.matchAll(/^\[C\d+\] citation: (.+)$/gm)) {
        citations.push({ source: "contract", citation: match[1].trim() });
      }
      for (const match of userPrompt.matchAll(/^\[L\d+\].*\bcitation: (.+)$/gm)) {
        citations.push({ source: "legal", citation: match[1].trim() });
      }
      const usedFinancialFactKeys = [...userPrompt.matchAll(/\[factKey: (.+?)\]/g)].map((match) => match[1].trim());

      const rawText = JSON.stringify({ answer: answerText, citations, usedFinancialFactKeys });
      return { rawText, diagnostics: { rawTextLength: rawText.length } };
    },
  };
}

export function makeMalformedProvider(): ContractAnalysisProvider {
  return {
    async generate(): Promise<ContractAnalysisProviderResponse> {
      return { rawText: "this is not json", diagnostics: { rawTextLength: 16 } };
    },
  };
}

export function makeThrowingProvider(error: ContractAnalysisError): ContractAnalysisProvider {
  return {
    async generate(): Promise<ContractAnalysisProviderResponse> {
      throw error;
    },
  };
}

export function makeSlowProvider(delayMs: number, answerText = "slow answer"): ContractAnalysisProvider {
  return {
    async generate(): Promise<ContractAnalysisProviderResponse> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const rawText = JSON.stringify({ answer: answerText, citations: [], usedFinancialFactKeys: [] });
      return { rawText, diagnostics: { rawTextLength: rawText.length } };
    },
  };
}

export function rateLimitedError(): ContractAnalysisError {
  return new ContractAnalysisError("RATE_LIMITED", "The AI provider rejected the request due to rate limits or usage quotas.");
}

export function providerRequestFailedError(): ContractAnalysisError {
  return new ContractAnalysisError("PROVIDER_REQUEST_FAILED", "The AI provider rejected the analysis request.");
}

/**
 * Always supplies BOTH a mocked primary and a mocked fallback provider —
 * this repository's test suite must never risk a real network call to
 * Gemini/OpenRouter, even via the fallback path. `composeAnswerOptions` is
 * merged (not replaced) with any override, so a test that only overrides
 * `provider` can never accidentally leave `fallbackProvider` defaulting to
 * the real OpenRouter implementation.
 */
export function fullyMockedDeps(overrides: Partial<ContractChatHandlerDeps> = {}): ContractChatHandlerDeps {
  const defaultComposeOptions = {
    provider: makeHonestMockProvider(),
    providerName: "mock-gemini",
    fallbackProvider: makeHonestMockProvider(),
    fallbackProviderName: "mock-openrouter",
  };
  return {
    isLegalRagConfigured: () => true,
    ...overrides,
    composeAnswerOptions: {
      ...defaultComposeOptions,
      ...(overrides.composeAnswerOptions ?? {}),
    },
  };
}
