import type { LegalSourceDocument } from "../schema";

/**
 * SAMA Rulebook — "Rules Governing Calculation of Annual Percentage Rate
 * (APR)" (قواعد احتساب معدل النسبة السنوية). Fetched and verified directly
 * against
 * https://rulebook.sama.gov.sa/en/rules-governing-calculation-annual-percentage-rate-apr-0
 * on the `lastVerifiedAt` date below.
 */
export const SAMA_APR_SOURCE: LegalSourceDocument = {
  sourceId: "sama_apr_calculation_rules",
  collectionId: "sama_apr",
  authority: "sama",
  documentTitleAr: "قواعد احتساب معدل النسبة السنوية (APR)",
  documentTitleEn: "Rules Governing Calculation of Annual Percentage Rate (APR)",
  documentType: "circular",
  officialSourceUrl: "https://rulebook.sama.gov.sa/en/rules-governing-calculation-annual-percentage-rate-apr-0",
  contractTypes: ["auto_finance", "personal_finance", "mortgage", "credit_card"],
  topics: ["apr"],
  jurisdiction: "SA",
  publicationDate: "2023-10-31",
  effectiveDate: "2023-10-31",
  lastVerifiedAt: "2026-07-15",
  status: "active",
  language: "en",
  version: "circular_45025707",
  ingestionPath: "legal-sources/sama/sama_apr_calculation_rules.txt",
};
