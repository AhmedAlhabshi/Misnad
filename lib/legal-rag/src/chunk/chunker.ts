import type { ContractType } from "@workspace/contract-types";
import type { LegalLanguage, LegalSourceStatus } from "../manifest/schema";
import { computeChecksum } from "../ingestion/checksum";
import type { LegalChunk } from "./schema";

export interface ChunkSourceMeta {
  sourceId: string;
  authority: string;
  documentTitle: string;
  contractTypes: ContractType[];
  topics: string[];
  language: LegalLanguage;
  status: LegalSourceStatus;
  effectiveDate: string | null;
  officialSourceUrl: string;
}

/** Matches an English "Article 9" / "Article 9: Fees and Charges" heading line. */
const ARTICLE_HEADING_EN = /^\s*Article\s+([0-9]+[A-Za-z]?)\s*[:.\-–]?\s*(.*)$/i;
/** Matches an Arabic "المادة 9" / "المادة التاسعة" heading line — the number/word group excludes trailing punctuation (e.g. the colon in "المادة 9:") so it never gets swallowed into the captured article number. */
const ARTICLE_HEADING_AR = /^\s*المادة\s+([^\s:.\-–]+)\s*[:.\-–]?\s*(.*)$/;

const CHAPTER_HEADING_EN = /^\s*(Chapter|Section)\s+.+$/i;
const CHAPTER_HEADING_AR = /^\s*(الفصل|القسم|الباب)\s+.+$/;

/** Soft cap — an article whose accumulated body exceeds this is split further at paragraph boundaries, still sharing the same article number, never merged with a different article. Stays comfortably under the schema's 4000-char hard cap. */
const MAX_CHUNK_CHARS = 3500;

interface DetectedArticle {
  articleNumber: string;
  chapterSection: string | null;
  bodyLines: string[];
}

function matchArticleHeading(line: string): { articleNumber: string; titleTail: string } | null {
  const en = ARTICLE_HEADING_EN.exec(line);
  if (en) {
    return { articleNumber: `Article ${en[1]}`, titleTail: en[2]?.trim() ?? "" };
  }
  const ar = ARTICLE_HEADING_AR.exec(line);
  if (ar) {
    return { articleNumber: `المادة ${ar[1]}`, titleTail: ar[2]?.trim() ?? "" };
  }
  return null;
}

function matchChapterHeading(line: string): string | null {
  if (CHAPTER_HEADING_EN.test(line) || CHAPTER_HEADING_AR.test(line)) {
    return line.trim();
  }
  return null;
}

function splitOversizedBody(body: string): string[] {
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
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts.length > 0 ? parts : [body.slice(0, MAX_CHUNK_CHARS)];
}

/**
 * Splits raw legal text into structured chunks. Primary path: detect
 * "Article N" / "المادة N" headings (optionally preceded by a
 * chapter/section heading) and treat each article as its own semantic unit
 * — never merging two articles, never separating an article's text from
 * its own number. Only when NO article heading is found anywhere in the
 * document does this fall back to paragraph-level splitting, and every
 * chunk produced that way is flagged `needsManualReview: true` so it is
 * never silently trusted as if it were properly structured.
 */
export function chunkLegalText(rawText: string, meta: ChunkSourceMeta): LegalChunk[] {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");

  const articles: DetectedArticle[] = [];
  let currentChapter: string | null = null;
  let current: DetectedArticle | null = null;

  for (const line of lines) {
    const chapterMatch = matchChapterHeading(line);
    if (chapterMatch) {
      currentChapter = chapterMatch;
      continue;
    }
    const articleMatch = matchArticleHeading(line);
    if (articleMatch) {
      if (current) articles.push(current);
      current = {
        articleNumber: articleMatch.articleNumber,
        chapterSection: currentChapter,
        bodyLines: articleMatch.titleTail ? [articleMatch.titleTail] : [],
      };
      continue;
    }
    if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) articles.push(current);

  const hasStructure = articles.length > 0;
  const chunks: LegalChunk[] = [];
  let order = 0;

  if (hasStructure) {
    for (const article of articles) {
      const body = article.bodyLines.join("\n").trim();
      if (!body) continue;
      const parts = splitOversizedBody(body);
      for (const part of parts) {
        chunks.push(buildChunk(meta, part, article.articleNumber, article.chapterSection, order, false));
        order += 1;
      }
    }
  } else {
    const paragraphs = rawText
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const paragraph of paragraphs) {
      for (const part of splitOversizedBody(paragraph)) {
        chunks.push(buildChunk(meta, part, null, null, order, true));
        order += 1;
      }
    }
  }

  return chunks;
}

function buildChunk(
  meta: ChunkSourceMeta,
  text: string,
  articleNumber: string | null,
  chapterSection: string | null,
  order: number,
  needsManualReview: boolean,
): LegalChunk {
  const chunkId = `${meta.sourceId}::${articleNumber ? articleNumber.replace(/\s+/g, "_") : `p${order}`}::${order}`;
  return {
    chunkId,
    sourceId: meta.sourceId,
    authority: meta.authority,
    documentTitle: meta.documentTitle,
    articleNumber,
    chapterSection,
    contractTypes: meta.contractTypes,
    topics: meta.topics,
    text,
    language: meta.language,
    status: meta.status,
    effectiveDate: meta.effectiveDate,
    officialSourceUrl: meta.officialSourceUrl,
    chunkOrder: order,
    checksum: computeChecksum(text),
    needsManualReview,
  };
}
