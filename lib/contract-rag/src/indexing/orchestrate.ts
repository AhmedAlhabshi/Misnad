import { createHash } from "node:crypto";
import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import type { EmbeddingProvider } from "@workspace/legal-rag";
import { chunkContractText } from "../chunk/chunker";
import { getContractRagConfig } from "../config";
import { generateContractRagSessionId } from "../session/sessionId";
import type { ContractRagRepository, StoredContractChunk } from "../retrieval/repository";

/**
 * The ONLY shape this orchestrator will accept as input text. There is no
 * overload, no fallback, and no code path anywhere in this function that
 * reads raw extracted text — a caller must have already run the existing
 * PII-masking pipeline and can only hand this function the result of that,
 * never a raw string. This is the load-bearing enforcement point for
 * "raw contract text must never be embedded or stored."
 */
export interface MaskedContractDocument {
  maskedText: string;
}

export interface IndexContractSessionInput {
  maskedDocument: MaskedContractDocument;
  contractType: ContractType;
  analysisLanguage: AnalysisLanguage;
}

export interface IndexContractSessionDeps {
  repository: ContractRagRepository;
  embeddingProvider: EmbeddingProvider;
  /** Injectable so tests can assert a fixed clock; defaults to `Date.now`. */
  now?: () => Date;
}

export interface IndexContractSessionResult {
  sessionId: string;
  chunkCount: number;
  needsManualReviewCount: number;
}

function computeSourceFingerprint(maskedText: string): string {
  return createHash("sha256").update(maskedText, "utf8").digest("hex");
}

/**
 * Indexes exactly one uploaded contract's already-masked text into a new,
 * isolated Contract RAG session: truncate to the configured character
 * bound, chunk it contract-semantically, embed the chunks (RETRIEVAL_DOCUMENT),
 * and store them scoped to a freshly generated opaque session id. Every
 * bound (`maxIndexedChars`, `maxChunksPerContract`) comes from
 * `getContractRagConfig()`, never a literal here.
 *
 * On any failure (embedding provider error, repository error) this throws —
 * callers (the analyze-contract route) are expected to catch this and
 * degrade to `contractRagSessionId: null` rather than failing the whole
 * upload, exactly as documented in the phase spec. This function itself
 * never swallows an error, so callers get an honest signal.
 */
export async function indexContractSession(
  input: IndexContractSessionInput,
  deps: IndexContractSessionDeps,
): Promise<IndexContractSessionResult> {
  const config = getContractRagConfig();
  const now = deps.now ? deps.now() : new Date();

  const maskedText = input.maskedDocument.maskedText;
  if (!maskedText || maskedText.trim().length === 0) {
    throw new Error("Cannot index Contract RAG session: masked text is empty");
  }

  const truncatedText = maskedText.length > config.maxIndexedChars ? maskedText.slice(0, config.maxIndexedChars) : maskedText;

  const sessionId = generateContractRagSessionId();
  const expiresAt = new Date(now.getTime() + config.ttlMinutes * 60_000);

  let chunks = chunkContractText(truncatedText, { sessionId });
  if (chunks.length > config.maxChunksPerContract) {
    chunks = chunks.slice(0, config.maxChunksPerContract);
  }
  if (chunks.length === 0) {
    throw new Error("Cannot index Contract RAG session: no chunks were produced from the masked text");
  }

  const boundedChunks = chunks.map((chunk) =>
    chunk.text.length > config.maxChunkChars ? { ...chunk, text: chunk.text.slice(0, config.maxChunkChars) } : chunk,
  );

  const vectors = await deps.embeddingProvider.embed(
    boundedChunks.map((chunk) => chunk.text),
    "document",
  );

  const storedChunks: StoredContractChunk[] = boundedChunks.map((chunk, index) => ({
    ...chunk,
    embedding: vectors[index],
    expiresAt,
  }));

  await deps.repository.createSession({
    sessionId,
    contractType: input.contractType,
    analysisLanguage: input.analysisLanguage,
    expiresAt,
    sourceFingerprint: computeSourceFingerprint(truncatedText),
  });
  await deps.repository.replaceSessionChunks(sessionId, storedChunks);

  return {
    sessionId,
    chunkCount: storedChunks.length,
    needsManualReviewCount: storedChunks.filter((chunk) => chunk.needsManualReview).length,
  };
}
