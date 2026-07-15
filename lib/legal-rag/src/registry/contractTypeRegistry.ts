import type { ContractType } from "@workspace/contract-types";
import { LEGAL_COLLECTIONS, type CollectionId } from "./collections";

export interface ContractTypeLegalConfig {
  enabled: boolean;
  /** Searched first, in order; a hit here always outranks a fallback-collection hit (§ retrieval ranking). */
  preferredCollections: CollectionId[];
  /** Searched only when no preferred-collection result clears the relevance threshold, or the preferred collection is empty/disabled. */
  fallbackCollections: CollectionId[];
  supportedTopics: string[];
}

const DISABLED_FALLBACK_CONFIG: ContractTypeLegalConfig = {
  enabled: false,
  preferredCollections: [],
  fallbackCollections: [],
  supportedTopics: [],
};

/**
 * Config-driven contract-type → legal-collection routing. This is the ONLY
 * place contract-type-specific collection choices live — retrieval, the
 * router, and the API never branch on `ContractType` themselves, they only
 * ever read this map (or, for a removed/unknown type, fall through to
 * `DISABLED_FALLBACK_CONFIG` via `getContractTypeLegalConfig`).
 *
 * Every currently supported `ContractType` has an entry, even though only
 * `auto_finance`/`personal_finance` currently point at a collection with
 * real ingested data (`sama_consumer_finance`, `sama_apr`) — the rest name
 * their intended future collection so adding that collection's source data
 * later requires no registry change, only manifest entries.
 */
export const CONTRACT_TYPE_LEGAL_REGISTRY: Record<ContractType, ContractTypeLegalConfig> = {
  auto_finance: {
    enabled: true,
    preferredCollections: [LEGAL_COLLECTIONS.SAMA_CONSUMER_FINANCE, LEGAL_COLLECTIONS.SAMA_APR],
    fallbackCollections: [LEGAL_COLLECTIONS.CIVIL_TRANSACTIONS],
    supportedTopics: ["fees", "apr", "early_settlement", "disclosure", "collection", "default"],
  },
  personal_finance: {
    enabled: true,
    preferredCollections: [LEGAL_COLLECTIONS.SAMA_CONSUMER_FINANCE, LEGAL_COLLECTIONS.SAMA_APR],
    fallbackCollections: [LEGAL_COLLECTIONS.CIVIL_TRANSACTIONS],
    supportedTopics: ["fees", "apr", "early_settlement", "disclosure", "collection", "default"],
  },
  credit_card: {
    enabled: true,
    preferredCollections: [LEGAL_COLLECTIONS.SAMA_CREDIT_CARD, LEGAL_COLLECTIONS.SAMA_APR],
    fallbackCollections: [LEGAL_COLLECTIONS.CIVIL_TRANSACTIONS],
    supportedTopics: ["fees", "apr", "minimum_payment", "disclosure", "collection"],
  },
  mortgage: {
    enabled: true,
    preferredCollections: [LEGAL_COLLECTIONS.SAMA_MORTGAGE, LEGAL_COLLECTIONS.SAMA_APR],
    fallbackCollections: [LEGAL_COLLECTIONS.CIVIL_TRANSACTIONS],
    supportedTopics: ["fees", "apr", "early_settlement", "disclosure"],
  },
  lease: {
    enabled: true,
    preferredCollections: [LEGAL_COLLECTIONS.EJAR],
    fallbackCollections: [LEGAL_COLLECTIONS.CIVIL_TRANSACTIONS],
    supportedTopics: ["maintenance", "payments", "renewal", "termination", "documentation"],
  },
  insurance: {
    enabled: true,
    preferredCollections: [LEGAL_COLLECTIONS.INSURANCE_AUTHORITY],
    fallbackCollections: [LEGAL_COLLECTIONS.CIVIL_TRANSACTIONS],
    supportedTopics: ["coverage", "exclusions", "deductibles", "claims", "cancellation", "refunds"],
  },
  employment: {
    enabled: true,
    preferredCollections: [LEGAL_COLLECTIONS.LABOR_LAW],
    fallbackCollections: [LEGAL_COLLECTIONS.CIVIL_TRANSACTIONS],
    supportedTopics: ["probation", "salary", "deductions", "overtime", "leave", "notice", "termination", "end_of_service"],
  },
  subscription: {
    enabled: true,
    preferredCollections: [LEGAL_COLLECTIONS.MOC_ECOMMERCE],
    fallbackCollections: [LEGAL_COLLECTIONS.CIVIL_TRANSACTIONS],
    supportedTopics: ["disclosure", "cancellation", "refund", "renewal", "delayed_service"],
  },
  other: {
    enabled: true,
    preferredCollections: [LEGAL_COLLECTIONS.CIVIL_TRANSACTIONS],
    fallbackCollections: [],
    // Deliberately empty: "other" only searches a detected topic when one is
    // actually supplied, never forces a sector-specific collection onto an
    // unrelated contract (§2.J of the architecture plan).
    supportedTopics: [],
  },
};

/**
 * Safe accessor — returns the registry entry for a known, enabled contract
 * type, or an inert disabled config for anything unrecognized (including a
 * contract type whose entry was deliberately removed). Retrieval always
 * calls this rather than indexing the registry object directly, so removing
 * one contract type's entry degrades that type to "no legal collections
 * search happens" instead of throwing and never touches any other type's
 * entry.
 */
export function getContractTypeLegalConfig(
  contractType: string,
  registry: Record<string, ContractTypeLegalConfig> = CONTRACT_TYPE_LEGAL_REGISTRY,
): ContractTypeLegalConfig {
  const entry = registry[contractType];
  if (!entry || !entry.enabled) {
    return DISABLED_FALLBACK_CONFIG;
  }
  return entry;
}
