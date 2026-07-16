import { computeChunkChecksum } from "./checksum";
import type { ContractChunk } from "./schema";

export interface ChunkContractMeta {
  sessionId: string;
}

/** Arabic ordinal enumeration words commonly used as top-level clause markers in Saudi contracts (with and without the trailing tanween alif). */
const ARABIC_ORDINALS = [
  "أولاً", "أولا",
  "ثانياً", "ثانيا",
  "ثالثاً", "ثالثا",
  "رابعاً", "رابعا",
  "خامساً", "خامسا",
  "سادساً", "سادسا",
  "سابعاً", "سابعا",
  "ثامناً", "ثامنا",
  "تاسعاً", "تاسعا",
  "عاشراً", "عاشرا",
];

const ARABIC_ORDINAL_HEADING = new RegExp(`^\\s*(${ARABIC_ORDINALS.join("|")})\\s*[:.\\-–]?\\s*(.*)$`);
/** Arabic "المادة 9" / "البند 9" — same shape as legal-rag's article heading, generalized to also match "البند" (clause). */
const ARABIC_ARTICLE_HEADING = /^\s*(المادة|البند)\s+([^\s:.\-–]+)\s*[:.\-–]?\s*(.*)$/;
/** English "Section 9" / "Clause 9" / "Article 9". */
const ENGLISH_HEADING = /^\s*(Section|Clause|Article)\s+([0-9]+[A-Za-z]?)\s*[:.\-–]?\s*(.*)$/i;
/** A generic numbered clause marker, e.g. "1." / "1)" / "1-" at the start of a line — common across contract types regardless of language. */
const NUMBERED_CLAUSE_HEADING = /^\s*([0-9]{1,3})[.)\-]\s+(.*)$/;

/** Soft cap before a section is sub-split — keeps chunks well under the schema/embedding-input size while staying well above a "tiny unusable fragment". */
const MAX_CHUNK_CHARS = 2000;
/** Never below this length for a fallback paragraph chunk, unless the whole document is shorter — avoids indexing single-word fragments. */
const MIN_USABLE_CHUNK_CHARS = 20;
/** Trailing characters of a sub-chunk carried into the next sub-chunk of the SAME oversized section, so a cut mid-thought doesn't lose meaning. Never applied across two genuinely different sections. */
const SUB_SPLIT_OVERLAP_CHARS = 150;

interface DetectedSection {
  label: string | null;
  bodyLines: string[];
}

function matchHeading(line: string): { label: string; titleTail: string } | null {
  const ordinal = ARABIC_ORDINAL_HEADING.exec(line);
  if (ordinal) {
    return { label: ordinal[1], titleTail: ordinal[2]?.trim() ?? "" };
  }
  const arArticle = ARABIC_ARTICLE_HEADING.exec(line);
  if (arArticle) {
    return { label: `${arArticle[1]} ${arArticle[2]}`, titleTail: arArticle[3]?.trim() ?? "" };
  }
  const en = ENGLISH_HEADING.exec(line);
  if (en) {
    return { label: `${en[1]} ${en[2]}`, titleTail: en[3]?.trim() ?? "" };
  }
  const numbered = NUMBERED_CLAUSE_HEADING.exec(line);
  if (numbered) {
    return { label: numbered[1], titleTail: numbered[2]?.trim() ?? "" };
  }
  return null;
}

function splitOversized(body: string): string[] {
  if (body.length <= MAX_CHUNK_CHARS) {
    return [body];
  }
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const parts: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > MAX_CHUNK_CHARS && current) {
      parts.push(current);
      // Bounded overlap: carry a short trailing tail of the previous part
      // into the next, only within this same oversized section — never
      // across two genuinely different clauses/sections.
      const overlap = current.slice(-SUB_SPLIT_OVERLAP_CHARS);
      current = `${overlap}\n\n${paragraph}`;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts.length > 0 ? parts : [body.slice(0, MAX_CHUNK_CHARS)];
}

/**
 * Splits masked contract text into contract-semantic chunks. Primary path:
 * detect Arabic ordinal (أولاً/ثانياً/...), المادة/البند, English
 * Section/Clause/Article, or generic numbered ("1.") headings, and treat
 * each detected section as its own unit — never merging two sections,
 * never inventing a heading that isn't actually in the text. Falls back to
 * paragraph-level splitting (flagged `needsManualReview: true`) only when
 * NO heading of any kind is found anywhere in the document — the same
 * honesty rule Legal RAG's chunker already follows.
 *
 * Deliberately contract-type-agnostic: no branch here reads or depends on
 * contract type. The same four heading families cover auto finance, lease,
 * employment, insurance, subscription, etc. equally, since none of those
 * types get a bespoke parser in this phase.
 */
export function chunkContractText(maskedText: string, meta: ChunkContractMeta): ContractChunk[] {
  const lines = maskedText.replace(/\r\n/g, "\n").split("\n");

  const sections: DetectedSection[] = [];
  let current: DetectedSection | null = null;

  for (const line of lines) {
    const heading = matchHeading(line);
    if (heading) {
      if (current) sections.push(current);
      current = { label: heading.label, bodyLines: heading.titleTail ? [heading.titleTail] : [] };
      continue;
    }
    if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) sections.push(current);

  const hasStructure = sections.some((s) => s.bodyLines.join("\n").trim().length > 0);
  const chunks: ContractChunk[] = [];
  let order = 0;

  if (hasStructure) {
    for (const section of sections) {
      const body = section.bodyLines.join("\n").trim();
      if (!body) continue;
      for (const part of splitOversized(body)) {
        if (part.trim().length < MIN_USABLE_CHUNK_CHARS) continue;
        chunks.push(buildChunk(meta, part, section.label, order, false));
        order += 1;
      }
    }
  } else {
    const paragraphs = maskedText
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length >= MIN_USABLE_CHUNK_CHARS);
    for (const paragraph of paragraphs) {
      for (const part of splitOversized(paragraph)) {
        if (part.trim().length < MIN_USABLE_CHUNK_CHARS) continue;
        chunks.push(buildChunk(meta, part, null, order, true));
        order += 1;
      }
    }
  }

  return chunks;
}

function buildChunk(meta: ChunkContractMeta, text: string, section: string | null, order: number, needsManualReview: boolean): ContractChunk {
  const checksum = computeChunkChecksum(text);
  const chunkId = `${meta.sessionId}::${section ? section.replace(/\s+/g, "_") : `p${order}`}::${order}`;
  return {
    chunkId,
    sessionId: meta.sessionId,
    chunkOrder: order,
    section,
    text,
    topics: [],
    checksum,
    needsManualReview,
  };
}
