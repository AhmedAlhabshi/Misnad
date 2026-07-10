import { GoogleGenAI } from "@google/genai";
import {
  missingApiKeyError,
  noUsableResponseError,
  providerRequestFailedError,
  rateLimitedError,
} from "../errors";
import type {
  ContractAnalysisProvider,
  ContractAnalysisProviderRequest,
  ContractAnalysisProviderResponse,
} from "./types";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw missingApiKeyError();
  }

  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }

  return cachedClient;
}

function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

function isRateLimitLikeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate.?limit|quota|resource_exhausted/i.test(message);
}

/**
 * Builds the `generateContent` params for a given request. Pulled out as a
 * pure function (no network calls) so structured-output wiring — in
 * particular, that a provided `jsonSchema` is actually forwarded via
 * `responseJsonSchema` — can be unit-tested without calling Gemini.
 */
export function buildGenerateContentParams(
  model: string,
  request: ContractAnalysisProviderRequest,
) {
  return {
    model,
    contents: [
      {
        role: "user" as const,
        parts: [{ text: request.userPrompt }],
      },
    ],
    config: {
      systemInstruction: request.systemInstructions,
      responseMimeType: "application/json",
      ...(request.jsonSchema
        ? { responseJsonSchema: request.jsonSchema }
        : {}),
      maxOutputTokens: 8192,
    },
  };
}

export const geminiContractAnalysisProvider: ContractAnalysisProvider = {
  async generate(
    request: ContractAnalysisProviderRequest,
  ): Promise<ContractAnalysisProviderResponse> {
    const client = getClient();
    const model = getModel();

    let response;
    try {
      response = await client.models.generateContent(
        buildGenerateContentParams(model, request),
      );
    } catch (error) {
      if (isRateLimitLikeError(error)) {
        throw rateLimitedError();
      }
      throw providerRequestFailedError();
    }

    const text = response.text;

    if (!text || !text.trim()) {
      throw noUsableResponseError();
    }

    return { rawText: text };
  },
};
