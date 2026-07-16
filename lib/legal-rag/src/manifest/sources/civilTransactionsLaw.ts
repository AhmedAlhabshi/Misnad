import type { LegalSourceDocument } from "../schema";

/**
 * Civil Transactions Law (نظام المعاملات المدنية) — Saudi Arabia's general
 * civil code, drafted by هيئة الخبراء بمجلس الوزراء (Bureau of Experts at
 * the Council of Ministers, named explicitly in the approving resolution
 * below) and promulgated via Council of Ministers Resolution No. 820 dated
 * 24/11/1444H.
 *
 * Fetched and directly verified in this phase against the Official Gazette
 * (جريدة أم القرى) — not the secondary laws.boe.gov.sa portal, which could
 * not be reached from this environment due to a TLS certificate chain
 * failure:
 *   - Full promulgated text: https://uqn.gov.sa/details?p=23125
 *   - Council of Ministers approval resolution (confirms the drafting
 *     authority and the exact promulgation date): https://uqn.gov.sa/details?p=23123
 * Both pages independently show the same publication date: 1444-12-01H,
 * corresponding to 2023-06-19 Gregorian.
 *
 * The underlying Royal Decree number commonly cited by secondary sources
 * (M/191) was NOT independently confirmed from a primary document within
 * this session — the approval resolution states a Royal Decree was
 * "prepared to accompany" it but does not itself state the decree number,
 * and the decree's own separate Gazette entry was not located/fetched.
 * `version` therefore cites the resolution number that was actually
 * verified, not the unverified decree number.
 *
 * This is a curated excerpt, not the full ~700-article law: only the
 * articles most relevant to reviewing a private contract were selected —
 * contract formation and consent, defects of consent (error/fraud/duress/
 * exploitation), voidability and nullity, binding force, good faith,
 * adhesion contracts, the hardship/exceptional-circumstances doctrine,
 * interpretation, rescission for breach, impossibility of performance,
 * and damages/penalty-clause provisions (including the court's power to
 * reduce an excessive agreed penalty). No effectiveDate is asserted since
 * the specific coming-into-force article was not part of the fetched
 * excerpt.
 */
export const CIVIL_TRANSACTIONS_LAW_SOURCE: LegalSourceDocument = {
  sourceId: "civil_transactions_law",
  collectionId: "civil_transactions",
  authority: "bureau_of_experts",
  documentTitleAr: "نظام المعاملات المدنية",
  documentTitleEn: null,
  documentType: "law",
  officialSourceUrl: "https://uqn.gov.sa/details?p=23125",
  contractTypes: [
    "auto_finance",
    "personal_finance",
    "mortgage",
    "credit_card",
    "lease",
    "insurance",
    "employment",
    "subscription",
    "other",
  ],
  topics: [
    "contract_formation",
    "consent",
    "interpretation",
    "binding_force",
    "good_faith",
    "performance",
    "breach",
    "compensation",
    "termination",
    "rescission",
    "force_majeure",
    "hardship",
    "penalty_clauses",
    "invalid_conditions",
  ],
  jurisdiction: "SA",
  publicationDate: "2023-06-19",
  effectiveDate: null,
  lastVerifiedAt: "2026-07-16",
  status: "active",
  language: "ar",
  version: "council_of_ministers_resolution_820_1444",
  ingestionPath: "legal-sources/bureau_of_experts/civil_transactions_law.txt",
};
