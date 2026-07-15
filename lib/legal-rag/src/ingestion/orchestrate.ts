import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chunkLegalText } from "../chunk/chunker";
import type { EmbeddedLegalChunk, LegalChunk } from "../chunk/schema";
import type { EmbeddingProvider } from "../embeddings/types";
import { findSourceById, LEGAL_SOURCE_MANIFEST, validateManifest } from "../manifest";
import type { LegalSourceDocument } from "../manifest/schema";
import type { LegalChunkRepository } from "../retrieval/repository";
import { validateLegalTextQuality } from "./textQuality";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
/** `src/ingestion/` -> package root. */
const PACKAGE_ROOT = path.resolve(CURRENT_DIR, "..", "..");

export interface IngestionResult {
  sourceId: string;
  chunkCount: number;
  embeddedCount: number;
  skippedUnchangedCount: number;
  manualReviewCount: number;
}

export interface IngestSourceDeps {
  repository: LegalChunkRepository;
  embeddingProvider: EmbeddingProvider;
  manifest?: readonly LegalSourceDocument[];
  /** Absolute directory `ingestionPath` is resolved against — defaults to this package's own root. */
  packageRoot?: string;
}

/**
 * Ingests exactly one manifest source by id: load + validate the manifest
 * entry, read its curated local text, validate text quality, chunk it,
 * embed only chunks whose checksum actually changed since the last
 * ingestion, then upsert source + chunks together. A source is either
 * fully ingested or left exactly as it was before this call — an error at
 * any step throws before either repository write happens, so a document is
 * never left half-ingested.
 */
export async function ingestSource(sourceId: string, deps: IngestSourceDeps): Promise<IngestionResult> {
  const manifest = deps.manifest ?? LEGAL_SOURCE_MANIFEST;
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Cannot ingest: manifest is invalid — ${validation.errors.join("; ")}`);
  }

  const source = findSourceById(sourceId, manifest);
  if (!source) {
    throw new Error(`No manifest entry found for sourceId "${sourceId}"`);
  }

  const root = deps.packageRoot ?? PACKAGE_ROOT;
  const filePath = path.join(root, source.ingestionPath);
  const rawText = await readFile(filePath, "utf8");

  const quality = validateLegalTextQuality(rawText);
  if (!quality.ok) {
    throw new Error(`Text quality check failed for "${sourceId}": ${quality.reason}`);
  }

  const chunks = chunkLegalText(rawText, {
    sourceId: source.sourceId,
    authority: source.authority,
    documentTitle: source.documentTitleEn ?? source.documentTitleAr,
    contractTypes: source.contractTypes,
    topics: source.topics,
    language: source.language,
    status: source.status,
    effectiveDate: source.effectiveDate,
    officialSourceUrl: source.officialSourceUrl,
  });

  if (chunks.length === 0) {
    throw new Error(`No chunks were produced for "${sourceId}" — refusing to ingest an empty source`);
  }

  const existing = await deps.repository.getExistingChunkFingerprints(sourceId);
  const toEmbed: LegalChunk[] = [];
  const embedded: EmbeddedLegalChunk[] = [];
  let skippedUnchanged = 0;

  for (const chunk of chunks) {
    const prior = existing.get(chunk.chunkId);
    if (prior && prior.checksum === chunk.checksum) {
      embedded.push({ chunk, embedding: prior.embedding });
      skippedUnchanged += 1;
    } else {
      toEmbed.push(chunk);
    }
  }

  if (toEmbed.length > 0) {
    const vectors = await deps.embeddingProvider.embed(
      toEmbed.map((c) => c.text),
      "document",
    );
    toEmbed.forEach((chunk, index) => {
      embedded.push({ chunk, embedding: vectors[index] });
    });
  }

  embedded.sort((a, b) => a.chunk.chunkOrder - b.chunk.chunkOrder);

  await deps.repository.upsertSource(source);
  await deps.repository.replaceSourceChunks(sourceId, embedded);

  return {
    sourceId,
    chunkCount: chunks.length,
    embeddedCount: toEmbed.length,
    skippedUnchangedCount: skippedUnchanged,
    manualReviewCount: chunks.filter((c) => c.needsManualReview).length,
  };
}
