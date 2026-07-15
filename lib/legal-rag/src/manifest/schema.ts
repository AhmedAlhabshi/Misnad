import type { ContractType } from "@workspace/contract-types";
import { z } from "zod";

/**
 * Every authority this registry is prepared for. Only `sama` has any real
 * ingested source data in this phase — the others exist so the registry
 * (§ contract-type/legal-collection registry) never needs a structural
 * change when a future phase adds their collections.
 */
export const LEGAL_AUTHORITY_VALUES = [
  "bureau_of_experts",
  "sama",
  "mhrsd",
  "ejar",
  "insurance_authority",
  "moc",
] as const;
export const legalAuthoritySchema = z.enum(LEGAL_AUTHORITY_VALUES);
export type LegalAuthority = z.infer<typeof legalAuthoritySchema>;

export const LEGAL_DOCUMENT_TYPE_VALUES = [
  "law",
  "implementing_regulation",
  "circular",
  "standard_contract_form",
  "guidance",
] as const;
export const legalDocumentTypeSchema = z.enum(LEGAL_DOCUMENT_TYPE_VALUES);
export type LegalDocumentType = z.infer<typeof legalDocumentTypeSchema>;

export const LEGAL_SOURCE_STATUS_VALUES = ["active", "amended", "repealed", "unknown"] as const;
export const legalSourceStatusSchema = z.enum(LEGAL_SOURCE_STATUS_VALUES);
export type LegalSourceStatus = z.infer<typeof legalSourceStatusSchema>;

export const LEGAL_LANGUAGE_VALUES = ["ar", "en", "bilingual"] as const;
export const legalLanguageSchema = z.enum(LEGAL_LANGUAGE_VALUES);
export type LegalLanguage = z.infer<typeof legalLanguageSchema>;

/**
 * Official-domain allow-list. Only a URL whose hostname exactly matches (or
 * is a subdomain of) one of these may ever enter the manifest — enforced by
 * `isAllowedOfficialUrl` below and re-checked by the citation validator
 * (`src/citations/validate.ts`) so a fabricated or unofficial URL can never
 * reach a user twice over. Domains for authorities with no ingested source
 * yet are listed so the allow-list itself never needs to change shape when
 * a later phase adds their collections — but no manifest entry may cite one
 * of those domains until a real, human-verified source backs it.
 */
export const OFFICIAL_DOMAIN_ALLOWLIST = [
  // SAMA — verified in this phase (rulebook.sama.gov.sa fetched directly).
  "rulebook.sama.gov.sa",
  "sama.gov.sa",
  // Bureau of Experts / National Center for Legislation — domain observed
  // via search results this phase, not yet fetched; no source cites it yet.
  "laws.boe.gov.sa",
  // Prepared for future collections (§ legal-collection registry) — not
  // fetched or verified this phase, and no manifest entry references them.
  "hrsd.gov.sa",
  "mhrsd.gov.sa",
  "ejar.sa",
  "insuranceauthority.gov.sa",
  "mc.gov.sa",
] as const;

export function isAllowedOfficialUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return OFFICIAL_DOMAIN_ALLOWLIST.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");

/**
 * One curated, human-verified official legal document. Never populated by a
 * crawler — every entry is added by hand after confirming the source is
 * official, current, and directly fetchable (see `lastVerifiedAt`).
 */
export const legalSourceDocumentSchema = z
  .object({
    sourceId: z.string().min(1).max(120),
    /** Which named collection (§ registry) this source belongs to, e.g. `"sama_consumer_finance"`. */
    collectionId: z.string().min(1).max(120),
    authority: legalAuthoritySchema,
    documentTitleAr: z.string().min(1).max(300),
    /** Only set when an official English title actually exists — never a translation we produced ourselves. */
    documentTitleEn: z.string().min(1).max(300).nullable(),
    documentType: legalDocumentTypeSchema,
    officialSourceUrl: z.string().url(),
    contractTypes: z.array(z.custom<ContractType>((v) => typeof v === "string")).min(1).max(20),
    topics: z.array(z.string().min(1).max(60)).max(30),
    jurisdiction: z.string().min(1).max(10),
    publicationDate: isoDateString.nullable(),
    effectiveDate: isoDateString.nullable(),
    lastVerifiedAt: isoDateString,
    status: legalSourceStatusSchema,
    language: legalLanguageSchema,
    version: z.string().min(1).max(60),
    /** Path (relative to the package root) to the curated, locally-stored raw source text — never fetched at ingestion time. */
    ingestionPath: z.string().min(1).max(300),
  })
  .refine((entry) => isAllowedOfficialUrl(entry.officialSourceUrl), {
    message: "officialSourceUrl must be on the approved official-domain allow-list",
    path: ["officialSourceUrl"],
  });

export type LegalSourceDocument = z.infer<typeof legalSourceDocumentSchema>;
