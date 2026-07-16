import type { LegalSourceDocument } from "../schema";

/**
 * "الأحكام النظامية الخاصة بضبط العلاقة بين المؤجر والمستأجر" — the
 * regulatory provisions governing the landlord–tenant relationship,
 * issued by Royal Decree No. (M/73) dated 02/04/1447H and Council of
 * Ministers Resolution No. (226) dated 24/03/1447H, published by the
 * Official Gazette on 04/04/1447H. Fetched and directly verified against
 * the Real Estate General Authority's (الهيئة العامة للعقار) own site —
 * the page states its own legislation status as "ساري" (in force).
 *
 * Unlike the Civil Transactions Law and Labor Law sources, this page
 * displays only the Hijri issuance/publication dates (1447/04/02 and
 * 1447/04/04) with no accompanying Gregorian date. Rather than compute
 * (and risk mis-computing) a Hijri→Gregorian conversion that the source
 * itself never states, `publicationDate`/`effectiveDate` are left `null`
 * here — the Hijri dates are preserved in `version` instead.
 *
 * Structured with Arabic ordinal-enumeration headings (أولاً/ثانياً/...
 * حادي عشر/ثاني عشر) rather than numbered "المادة" articles — a real,
 * confirmed regulatory-drafting convention distinct from the Civil
 * Transactions Law's own numbering. Supporting this heading style
 * required a small additive extension to `chunk/chunker.ts`'s heading
 * detection (see that file's `ARABIC_ORDINAL_HEADING`), not a redesign.
 *
 * This is the complete regulation (all 12 numbered provisions), not an
 * excerpt: definitions, the rent-increase cap and objection process
 * (currently scoped to Riyadh, 5-year sunset), the exhaustive list of
 * grounds on which a landlord may refuse renewal, mandatory Ejar-network
 * contract registration, automatic renewal with a 60-day non-renewal
 * notice, penalties, and a final clause deferring anything not covered
 * here to the Civil Transactions Law — which cross-references confirm
 * that law's Royal Decree number (م/191) and date (29/11/1444H)
 * independently of the secondary sources noted in `civilTransactionsLaw.ts`.
 */
export const EJAR_LANDLORD_TENANT_PROVISIONS_SOURCE: LegalSourceDocument = {
  sourceId: "ejar_landlord_tenant_provisions",
  collectionId: "ejar",
  authority: "ejar",
  documentTitleAr: "الأحكام النظامية الخاصة بضبط العلاقة بين المؤجر والمستأجر",
  documentTitleEn: null,
  documentType: "law",
  officialSourceUrl:
    "https://rega.gov.sa/الأنظمة-واللوائح-والأدلة/الأنظمة/الأحكام-النظامية-الخاصة-بضبط-العلاقة-بين-المؤجر-والمستأجر/",
  contractTypes: ["lease"],
  topics: [
    "rent_payment",
    "renewal",
    "termination",
    "eviction",
    "contract_registration",
    "late_payment",
  ],
  jurisdiction: "SA",
  publicationDate: null,
  effectiveDate: null,
  lastVerifiedAt: "2026-07-16",
  status: "active",
  language: "ar",
  version: "royal_decree_m_73_1447",
  ingestionPath: "legal-sources/ejar/rega_landlord_tenant_provisions.txt",
};
