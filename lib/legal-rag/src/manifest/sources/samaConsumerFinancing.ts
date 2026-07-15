import type { LegalSourceDocument } from "../schema";

/**
 * SAMA Rulebook — "Regulations for Consumer Financing" (ضوابط التمويل
 * الاستهلاكي). Fetched and verified directly against
 * https://rulebook.sama.gov.sa/en/regulations-consumer-financing on the
 * `lastVerifiedAt` date below: official title (AR/EN), issuing authority,
 * regulation number, and in-force status were all read from that page —
 * none of these fields are guessed or inferred.
 */
export const SAMA_CONSUMER_FINANCING_SOURCE: LegalSourceDocument = {
  sourceId: "sama_regulations_consumer_financing",
  collectionId: "sama_consumer_finance",
  authority: "sama",
  documentTitleAr: "ضوابط التمويل الاستهلاكي",
  documentTitleEn: "Regulations for Consumer Financing",
  documentType: "implementing_regulation",
  officialSourceUrl: "https://rulebook.sama.gov.sa/en/regulations-consumer-financing",
  contractTypes: ["auto_finance", "personal_finance"],
  topics: ["fees", "early_settlement", "disclosure"],
  jurisdiction: "SA",
  publicationDate: "2014-07-07",
  effectiveDate: "2014-07-07",
  lastVerifiedAt: "2026-07-15",
  status: "active",
  language: "en",
  version: "reg_351000116619",
  ingestionPath: "legal-sources/sama/sama_regulations_consumer_financing.txt",
};
