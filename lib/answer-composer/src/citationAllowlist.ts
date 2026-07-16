import type { GroundedContext } from "@workspace/context-builder";
import type { ComposedCitation, LlmCitationRef } from "./schema";

export interface CitationAllowlistEntry {
  source: "contract" | "legal";
  citation: string;
  label: string;
  authority: string;
  excerpt: string;
}

/**
 * The ONLY source of truth for what may appear in a final answer's
 * `citations` array — built directly and exclusively from the
 * already-retrieved, already-budgeted `GroundedContext` the composer was
 * given. Financial and analysis facts never contribute an entry here (see
 * `schema.ts`'s doc-comment on `composedCitationSchema`), so it is
 * structurally impossible for `financialMetrics.*` / `contractAnalysis.*`
 * field paths to end up in `citations`.
 */
export function buildCitationAllowlist(context: GroundedContext): CitationAllowlistEntry[] {
  const contractEntries: CitationAllowlistEntry[] = context.contractEvidence.map((item) => ({
    source: "contract",
    citation: item.citation,
    label: item.section ?? `Passage ${item.chunkOrder + 1}`,
    authority: item.authority,
    excerpt: item.excerpt,
  }));

  const legalEntries: CitationAllowlistEntry[] = context.legalEvidence.map((item) => ({
    source: "legal",
    citation: item.citation,
    label: item.articleNumber ?? item.section ?? item.documentTitle,
    authority: item.authority,
    excerpt: item.excerpt,
  }));

  return [...contractEntries, ...legalEntries];
}

/**
 * Filters the model's claimed citations down to only those whose
 * `(source, citation)` pair exactly matches a real allowlist entry —
 * anything else (a hallucinated citation string, a citation for a source
 * that was never retrieved, a subtly altered URL) is silently dropped,
 * never surfaced. Every surviving citation's `label`/`authority`/`excerpt`
 * is then reconstructed from the matched allowlist entry itself — the
 * model's own claims about those fields (it isn't even asked for them; see
 * `llmCitationRefSchema`) are never trusted. Also deduplicates by
 * `(source, citation)`, keeping the first occurrence, and reports how many
 * candidates were dropped so the caller can add a warning.
 */
export function sanitizeCitations(
  candidates: readonly LlmCitationRef[],
  allowlist: readonly CitationAllowlistEntry[],
): { citations: ComposedCitation[]; droppedCount: number } {
  const citations: ComposedCitation[] = [];
  const seen = new Set<string>();
  let droppedCount = 0;

  for (const candidate of candidates) {
    const match = allowlist.find((entry) => entry.source === candidate.source && entry.citation === candidate.citation);
    if (!match) {
      droppedCount += 1;
      continue;
    }
    const key = `${match.source}:${match.citation}`;
    if (seen.has(key)) {
      droppedCount += 1;
      continue;
    }
    seen.add(key);
    citations.push({ source: match.source, label: match.label, citation: match.citation, authority: match.authority, excerpt: match.excerpt });
  }

  return { citations, droppedCount };
}

/** Every financial factKey actually present in the supplied context — the sole allowlist for `usedFinancialFactKeys`. */
export function buildFactKeyAllowlist(context: GroundedContext): Set<string> {
  return new Set(context.financialFacts.map((fact) => fact.factKey));
}

/** Filters + dedupes the model's claimed fact keys against the allowlist, reporting how many were dropped. */
export function sanitizeFactKeys(candidates: readonly string[], allowlist: ReadonlySet<string>): { factKeys: string[]; droppedCount: number } {
  const factKeys: string[] = [];
  const seen = new Set<string>();
  let droppedCount = 0;

  for (const key of candidates) {
    if (!allowlist.has(key) || seen.has(key)) {
      droppedCount += 1;
      continue;
    }
    seen.add(key);
    factKeys.push(key);
  }

  return { factKeys, droppedCount };
}
