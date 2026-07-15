/**
 * Named legal collections. A collection is just a label that groups
 * manifest entries (`LegalSourceDocument.collectionId`) and is referenced by
 * the contract-type registry (`./contractTypeRegistry.ts`) — it is plain
 * data, never a hardcoded branch in retrieval/prompting/UI code. Adding or
 * removing a collection means adding/removing manifest entries that use its
 * id and updating which contract types reference it here; nothing else in
 * the pipeline needs to change.
 *
 * Only the SAMA collections have any ingested source in this phase. The
 * rest are declared so the registry (§ below) is already complete and
 * stable — populating them later is additive.
 */
export const LEGAL_COLLECTIONS = {
  CIVIL_TRANSACTIONS: "civil_transactions",
  SAMA_CONSUMER_FINANCE: "sama_consumer_finance",
  SAMA_APR: "sama_apr",
  SAMA_CREDIT_CARD: "sama_credit_card",
  SAMA_MORTGAGE: "sama_mortgage",
  LABOR_LAW: "labor_law",
  EJAR: "ejar",
  INSURANCE_AUTHORITY: "insurance_authority",
  MOC_ECOMMERCE: "moc_ecommerce",
} as const;

export type CollectionId = (typeof LEGAL_COLLECTIONS)[keyof typeof LEGAL_COLLECTIONS];
