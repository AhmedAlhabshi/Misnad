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
/**
 * Matches an Arabic "المادة 9" / "المادة التاسعة" / "المادة الثامنة والسبعون
 * بعد المائة" heading line. Saudi legislation (unlike SAMA's plain-numeral
 * circulars) spells article numbers out as multi-word compound ordinals for
 * anything past the first few articles — the number/word group excludes
 * only the trailing colon/period/dash (not whitespace) so a multi-word
 * ordinal is captured in full instead of being cut off at its first space.
 */
const ARTICLE_HEADING_AR = /^\s*المادة\s+([^\n:.\-–]+)\s*[:.\-–]?\s*(.*)$/;

/**
 * Arabic ordinal-enumeration words (أولاً/ثانياً/.../ثاني عشر) used as
 * top-level clause markers instead of "المادة N" by some Saudi regulatory
 * texts (e.g. the Real Estate General Authority's "الأحكام النظامية" —
 * numbered provisions, not a numbered-article law). Matched as a fallback
 * heading style, never instead of an actual "المادة"/"Article" heading
 * when one exists in the same document.
 */
/**
 * Written without the tanween mark — the line being tested always has it
 * stripped first (see `stripArabicTanween`), which is what makes both
 * "ثانياً" (mark after a trailing alif) and "ثانيًا" (mark directly on the
 * final letter) match the same single entry here.
 */
const ARABIC_ORDINAL_WORDS = [
  "أولا",
  "ثانيا",
  "ثالثا",
  "رابعا",
  "خامسا",
  "سادسا",
  "سابعا",
  "ثامنا",
  "تاسعا",
  "عاشرا",
  "حادي عشر",
  "ثاني عشر",
  "ثالث عشر",
  "رابع عشر",
  "خامس عشر",
];
const ARABIC_ORDINAL_HEADING = new RegExp(`^\\s*(${ARABIC_ORDINAL_WORDS.join("|")})\\s*[:.\\-–]?\\s*(.*)$`);

/**
 * Arabic fathatan (tanween fatḥ, ً, U+064B) can be typeset either directly
 * on a word's final letter ("ثانيًا") or after a trailing silent alif
 * ("ثانياً") — both are correct, commonly-seen orthography for the exact
 * same word, but only one ordering can ever literal-match a fixed word
 * list. Stripping the mark before testing against `ARABIC_ORDINAL_HEADING`
 * makes detection tolerant of either convention — real official text uses
 * both interchangeably (the REGA landlord–tenant regulation, for one,
 * consistently uses the "mark-on-the-letter" ordering).
 */
function stripArabicTanween(line: string): string {
  return line.replace(/ً/g, "");
}

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
  const ordinal = ARABIC_ORDINAL_HEADING.exec(stripArabicTanween(line));
  if (ordinal) {
    return { articleNumber: ordinal[1], titleTail: ordinal[2]?.trim() ?? "" };
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
 * "Article N" / "المادة N" headings, or (for regulatory texts that number
 * their provisions with Arabic ordinal words instead — أولاً/ثانياً/...
 * rather than المادة) an Arabic ordinal-enumeration heading — optionally
 * preceded by a chapter/section heading — and treat each as its own
 * semantic unit — never merging two, never separating a provision's text
 * from its own number/label. Only when NO heading of either kind is found
 * anywhere in the document does this fall back to paragraph-level
 * splitting, and every chunk produced that way is flagged
 * `needsManualReview: true` so it is never silently trusted as if it were
 * properly structured.
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
