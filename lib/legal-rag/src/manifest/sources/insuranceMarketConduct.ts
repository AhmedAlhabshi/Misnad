import type { LegalSourceDocument } from "../schema";

/**
 * Insurance Market Code of Conduct — Part 2 (General Requirements) and
 * Part 3 (Market Conduct Standards) of the Implementing Regulations of
 * the Cooperative Insurance Companies Control Law (Royal Decree No. M/32,
 * dated 2.6.1424H / 31.7.2003). Fetched and directly verified against the
 * SAMA Rulebook (the same official portal already used for the two
 * existing SAMA sources): https://rulebook.sama.gov.sa/en/entiresection/1364.
 *
 * Note on authority: this specific regulation's own text was promulgated
 * under, and still names, the Saudi Central Bank (Governor/SAMA) —
 * day-to-day supervision of the insurance market has since moved to the
 * newly established Insurance Authority (هيئة التأمين) per general
 * public knowledge, but that transfer was not independently verified
 * against a primary document in this session, so `authority` reflects
 * what the source document itself actually states (`sama`), not the
 * collection's topical grouping (`insurance_authority` — see
 * `collectionId` — is still the correct collection for "insurance"
 * contract-type retrieval per the registry).
 *
 * This regulation numbers its Code of Conduct provisions as bare
 * sequential paragraphs under short topic headers (e.g. "Claims
 * Handling" / "52. For companies..."), not "Article N" — a genuinely
 * distinct convention from the other 4 sources in this manifest. Adding
 * bare-numeral heading detection to the shared chunker was deliberately
 * NOT done (unlike the two other chunker extensions made this phase):
 * a bare "52." is far too ambiguous a marker to safely recognize across
 * every future source without risking false splits inside an unrelated
 * numbered list elsewhere. Instead, the curated excerpt below is
 * formatted so each topic header sits on the same paragraph as its own
 * body text (single newline, not blank line) — the existing
 * paragraph-level fallback chunker already produces one well-formed
 * chunk per topic this way. Every chunk from this source is honestly
 * flagged `needsManualReview: true` (no fabricated `articleNumber`),
 * which is accurate: this document's structure genuinely isn't
 * machine-verified article numbering the way the other sources' is.
 *
 * `documentTitleAr` — the rulebook's own Arabic-language page for this
 * regulation did not render body content in this session (only the
 * section label loaded, no article text), so this Arabic title is not
 * from a directly rendered page body; it is the official Arabic name as
 * consistently corroborated across rulebook.sama.gov.sa's own
 * Arabic-slugged URL for this exact regulation and the Insurance
 * Authority's own document repository (ia.gov.sa), not a translation
 * produced by this pipeline.
 *
 * Retrieval-quality fix (live verification round 2): the original curated
 * excerpt bundled item 52 (Claims Handling) as one ~1900-char chunk
 * spanning the entire filing→investigation→decision→payment lifecycle,
 * and item 26 (Free Look) as one chunk spanning the free-look statement
 * plus unrelated refund-deduction mechanics. Both diluted the specific
 * "claim rejection/denial" and "cancel/free-look" signal a real embedding
 * needs, and live testing showed a shorter, more topically-compact
 * Non-Discrimination chunk (item 13, which happens to mention
 * "denying, canceling, and not renewing insurance policies") outranking
 * them for those exact questions. Both items were split — verbatim text
 * only, no invented sentences — into a compact "Claim Acceptance or
 * Rejection Decision" chunk and a compact "Right to Cancel a New Policy"
 * chunk, each now a focused standalone match. Article 13 was left
 * untouched (never artificially suppressed); the fix works by giving the
 * genuinely relevant provisions an equally sharp, undiluted signal.
 */
export const INSURANCE_MARKET_CONDUCT_SOURCE: LegalSourceDocument = {
  sourceId: "sama_insurance_market_conduct",
  collectionId: "insurance_authority",
  authority: "sama",
  documentTitleAr: "اللائحة التنفيذية لنظام مراقبة شركات التأمين التعاوني",
  documentTitleEn: "Insurance Market Code of Conduct (Implementing Regulations of the Cooperative Insurance Companies Control Law)",
  documentType: "implementing_regulation",
  officialSourceUrl: "https://rulebook.sama.gov.sa/en/entiresection/1364",
  contractTypes: ["insurance"],
  topics: [
    "disclosure",
    "cancellation",
    "claims",
    "claim_rejection",
    "complaints",
    "renewal",
    "exclusions",
    "deductibles",
    "beneficiary_rights",
  ],
  jurisdiction: "SA",
  publicationDate: "2003-07-31",
  effectiveDate: "2003-07-31",
  lastVerifiedAt: "2026-07-16",
  status: "active",
  language: "en",
  version: "royal_decree_m_32_1424",
  ingestionPath: "legal-sources/insurance_authority/sama_insurance_market_conduct.txt",
};
