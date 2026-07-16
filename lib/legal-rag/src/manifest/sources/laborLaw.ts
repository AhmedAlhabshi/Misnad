import type { LegalSourceDocument } from "../schema";

/**
 * Saudi Labor Law (نظام العمل) — base law issued by Royal Decree No. (M/51)
 * dated 23/8/1426H, under the Ministry of Human Resources and Social
 * Development (وزارة الموارد البشرية والتنمية الاجتماعية).
 *
 * This entry curates the 2024 omnibus amendment notice, fetched and
 * directly verified against the Official Gazette:
 * https://uqn.gov.sa/details?p=25379 ("تعديل بعض مواد نظام العمل"),
 * published 1446-2-19H / 2024-08-23 Gregorian. The amendment notice itself
 * states the base law's decree number/date verbatim, which is how that
 * metadata was confirmed directly from a primary source this session
 * (rather than only from secondary search results).
 *
 * Selected articles are the ones an individual employment-contract review
 * most needs and that this specific amendment happens to restate in full:
 * probation period (53), written-contract requirements and standard
 * contract fields (51, 52), fixed-term contracts for non-Saudi workers
 * (37), employer duties including non-discrimination/housing/transport
 * (61), disciplinary appeal process (72), grounds for contract termination
 * (74), notice periods for indefinite contracts (75), resignation
 * mechanics (79 bis), overtime pay (107), and several statutory leave
 * entitlements (113, 151). Scope exclusions from the Labor Law entirely
 * (Article 7) and a key definitions article (2) are also included.
 *
 * Two topics explicitly requested for this phase — end-of-service benefit
 * calculation (commonly cited as Article 84) and the non-compete clause
 * (commonly cited as Article 83) — could NOT be independently verified
 * against a primary official source within this session (only secondary/
 * unofficial legal-blog paraphrases were found) and were deliberately
 * excluded rather than reconstructed from those sources. See the phase
 * report for detail.
 */
export const LABOR_LAW_SOURCE: LegalSourceDocument = {
  sourceId: "labor_law_2024_amendments",
  collectionId: "labor_law",
  authority: "mhrsd",
  documentTitleAr: "نظام العمل",
  documentTitleEn: null,
  documentType: "law",
  officialSourceUrl: "https://uqn.gov.sa/details?p=25379",
  contractTypes: ["employment"],
  topics: [
    "probation",
    "contract_duration",
    "fixed_term_contracts",
    "employee_duties",
    "employer_duties",
    "termination",
    "resignation",
    "notice_period",
    "disciplinary_action",
    "overtime",
    "leave",
  ],
  jurisdiction: "SA",
  publicationDate: "2024-08-23",
  effectiveDate: "2024-08-23",
  lastVerifiedAt: "2026-07-16",
  status: "active",
  language: "ar",
  version: "gazette_amendment_1446_02_19",
  ingestionPath: "legal-sources/mhrsd/labor_law_2024_amendments.txt",
};
