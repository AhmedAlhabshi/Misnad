import { legalSourceDocumentSchema, type LegalSourceDocument } from "./schema";
import { CIVIL_TRANSACTIONS_LAW_SOURCE } from "./sources/civilTransactionsLaw";
import { EJAR_LANDLORD_TENANT_PROVISIONS_SOURCE } from "./sources/ejarLandlordTenantProvisions";
import { INSURANCE_MARKET_CONDUCT_SOURCE } from "./sources/insuranceMarketConduct";
import { LABOR_LAW_SOURCE } from "./sources/laborLaw";
import { SAMA_APR_SOURCE } from "./sources/samaApr";
import { SAMA_CONSUMER_FINANCING_SOURCE } from "./sources/samaConsumerFinancing";

export * from "./schema";

/**
 * The full curated source manifest. Adding a new official document means
 * adding one entry here (and its own `sources/*.ts` file for readability as
 * the list grows) — never a schema or pipeline change.
 */
export const LEGAL_SOURCE_MANIFEST: readonly LegalSourceDocument[] = [
  SAMA_CONSUMER_FINANCING_SOURCE,
  SAMA_APR_SOURCE,
  CIVIL_TRANSACTIONS_LAW_SOURCE,
  LABOR_LAW_SOURCE,
  EJAR_LANDLORD_TENANT_PROVISIONS_SOURCE,
  INSURANCE_MARKET_CONDUCT_SOURCE,
];

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates every manifest entry against its schema (including the
 * official-domain allow-list) and rejects duplicate `sourceId`s. Used by the
 * `verify-legal-manifest` CLI (future) and by tests — never bypassed by
 * ingestion, which refuses to run against an invalid manifest.
 */
export function validateManifest(manifest: readonly LegalSourceDocument[] = LEGAL_SOURCE_MANIFEST): ManifestValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const entry of manifest) {
    const result = legalSourceDocumentSchema.safeParse(entry);
    if (!result.success) {
      errors.push(`${entry.sourceId ?? "<unknown>"}: ${result.error.issues.map((i) => i.message).join("; ")}`);
      continue;
    }
    if (seenIds.has(entry.sourceId)) {
      errors.push(`duplicate sourceId: ${entry.sourceId}`);
    }
    seenIds.add(entry.sourceId);
  }

  return { valid: errors.length === 0, errors };
}

export function findSourceById(sourceId: string, manifest: readonly LegalSourceDocument[] = LEGAL_SOURCE_MANIFEST): LegalSourceDocument | null {
  return manifest.find((entry) => entry.sourceId === sourceId) ?? null;
}
