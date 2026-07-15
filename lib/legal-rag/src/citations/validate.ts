import { isAllowedOfficialUrl } from "../manifest/schema";
import type { LegalSearchResultItem } from "../retrieval/service";

export interface CitationValidationResult {
  valid: boolean;
  reason: string | null;
}

/**
 * Confirms one result item is safe to cite: every required citation field
 * is present, and its `officialSourceUrl` is on the approved-domain
 * allow-list. Called on every result the retrieval service produces before
 * it reaches the API response — a result failing this check is dropped
 * rather than returned, so a fabricated or unofficial URL can never reach a
 * user even if something upstream produced one.
 */
export function validateResultCitation(result: LegalSearchResultItem): CitationValidationResult {
  if (!result.chunkId || !result.authority || !result.documentTitle) {
    return { valid: false, reason: "missing required citation field (chunkId, authority, or documentTitle)" };
  }
  if (!result.officialSourceUrl || !isAllowedOfficialUrl(result.officialSourceUrl)) {
    return { valid: false, reason: "officialSourceUrl is missing or not on the approved official-domain allow-list" };
  }
  return { valid: true, reason: null };
}

export function filterValidCitations(results: readonly LegalSearchResultItem[]): LegalSearchResultItem[] {
  return results.filter((result) => validateResultCitation(result).valid);
}

export interface CitedChunkValidationResult {
  valid: boolean;
  /** Any cited id that was NOT part of the actually-retrieved set — a fabricated or stale citation. */
  invalidChunkIds: string[];
}

/**
 * Reusable building block for the FUTURE grounded-answer composer (not
 * built in this phase): given the set of chunk ids a model claims to have
 * cited, confirms every one of them is actually a member of the chunk ids
 * that were retrieved for that request. A model can never be allowed to
 * cite a chunk that was never handed to it.
 */
export function validateCitedChunkIds(citedChunkIds: readonly string[], retrievedChunkIds: ReadonlySet<string>): CitedChunkValidationResult {
  const invalidChunkIds = citedChunkIds.filter((id) => !retrievedChunkIds.has(id));
  return { valid: invalidChunkIds.length === 0, invalidChunkIds };
}
