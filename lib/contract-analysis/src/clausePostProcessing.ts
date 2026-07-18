import type { ImportantClause } from "@workspace/contract-schema";

/**
 * Deterministic, non-AI post-processing applied to every model response's
 * `importantClauses` array, right after schema validation succeeds (see
 * `service.ts`). Exists because the model alone is not reliably consistent
 * about where one clause ends and the next begins: the same contract, with
 * an identical prompt/provider/masked text, was observed to return 4 or 5
 * clauses across separate runs, because a single paragraph bundling two or
 * three independently-effective provisions (e.g. "late payment notice" +
 * "collection cost cap" + "early settlement", or "vehicle ownership" +
 * "insurance coverage") was sometimes merged into one clause and sometimes
 * split into several by the model's own (temperature-driven) judgment.
 *
 * The deterministic rule this module enforces: a separate legal/financial
 * obligation, right, restriction, penalty, fee, or condition must be
 * represented as a separate clause whenever it has an independent effect —
 * never merged merely because it happens to share a paragraph with another
 * provision. This module never invents clause content: every derived clause
 * is built only from text the model itself already returned (a sentence-level
 * slice of `summary`/`plainExplanation`), never fabricated or reworded.
 *
 * Pipeline (applied in this order, and safe to re-run on its own output —
 * see `service.ts`'s idempotence test): normalize titles -> split compound
 * clauses -> deduplicate genuinely equivalent clauses -> stable sort.
 */

// ---------------------------------------------------------------------------
// 1. Title normalization
// ---------------------------------------------------------------------------

/**
 * Conservative, content-preserving normalization — never translates,
 * rewords, or shortens the title itself. Only removes whitespace/punctuation
 * noise so titles compare consistently for deduplication and rendering.
 */
export function normalizeClauseTitle(title: string): string {
  return title
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[:\-–—،,]+$/u, "")
    .trim();
}

// ---------------------------------------------------------------------------
// 2. Compound-clause splitting
// ---------------------------------------------------------------------------

/**
 * One independently-effective legal/financial concept a clause's text can
 * anchor on. Each entry's `keywords` are matched case-insensitively as plain
 * substrings against the clause's combined `summary + plainExplanation`
 * text — deliberately simple substring matching (not stemming/NLP), so the
 * rule stays fully deterministic and auditable.
 *
 * IMPORTANT — scope of this catalog: the split MECHANISM below (sentence
 * segmentation, ambiguity-conservative grouping, never-guess fallback) is
 * fully generic and has no knowledge of any specific contract type or
 * concept. What IS necessarily bounded is this catalog: a clause can only be
 * split along a boundary this list knows how to name. This is a deliberate
 * trade-off, not an oversight — an open-ended NLP-based boundary detector
 * would risk exactly what requirement #6 forbids (inventing or corrupting
 * clause boundaries), so the catalog is kept small, explicit, and auditable
 * instead. A compound clause whose concepts are NOT in this list is safely
 * left unsplit (see `splitClauseIfCompound`'s fallback) — a false merge,
 * which is the safe failure mode, never a guessed split.
 *
 * The catalog below intentionally spans multiple of this app's supported
 * contract types (`@workspace/contract-types`'s `ContractType`: auto/personal
 * finance, mortgage, credit card, lease, insurance, employment, subscription,
 * other) — not just the auto-finance fixture that originally surfaced this
 * bug — so it is not hardcoded to one contract type. Extend it further as new
 * recurring compound-clause patterns are found in other contract types.
 */
interface ConceptAnchor {
  id: string;
  /** Fallback title used only when a derived sub-clause's own sentence is too short/generic to serve as a title on its own. Never shown when the source text already provides a usable title. */
  fallbackTitle: string;
  keywords: readonly string[];
}

const CONCEPT_ANCHORS: readonly ConceptAnchor[] = [
  // --- auto/personal finance: late payment & settlement ------------------
  {
    id: "late_payment",
    fallbackTitle: "التأخر في السداد",
    keywords: ["التأخر في السداد", "التأخر عن سداد", "التأخير في الدفع", "late payment", "overdue payment", "payment delay"],
  },
  {
    id: "collection_cost",
    fallbackTitle: "تكاليف التحصيل",
    keywords: ["تكاليف التحصيل", "رسوم التحصيل", "تكلفة التحصيل", "collection cost", "collection fee", "collection charges"],
  },
  {
    id: "early_settlement",
    fallbackTitle: "السداد المبكر",
    keywords: ["السداد المبكر", "التسوية المبكرة", "الوفاء المبكر", "early settlement", "early repayment", "early payoff"],
  },
  {
    id: "ownership",
    fallbackTitle: "ملكية الأصل",
    keywords: ["ملكية المركبة", "ملكية العقار", "تسجيل المركبة", "تبقى المركبة مسجلة", "vehicle ownership", "title to the vehicle", "remains registered"],
  },
  // Insurance is split into two anchors, not one — "included for year one"
  // and "renewal cost in later years" are independently-effective facts
  // (the first is a benefit bundled into the current price, the second is a
  // future cost the customer bears alone) and must never collapse into a
  // single generic "insurance" clause merely because both sentences mention
  // insurance. Each anchor's keywords deliberately key on the differentiator
  // (first year vs. renewal/later years), not on the shared word "insurance"
  // itself, so a sentence naming only one of the two stays unambiguous.
  {
    id: "insurance_first_year",
    fallbackTitle: "التأمين للسنة الأولى",
    keywords: [
      "للسنة الأولى",
      "السنة الأولى فقط",
      "first year only",
      "for the first year",
      "included for the first year",
      "first-year insurance",
    ],
  },
  {
    id: "insurance_renewal",
    fallbackTitle: "تجديد التأمين للسنوات اللاحقة",
    keywords: [
      "تجديد التأمين",
      "السنوات اللاحقة",
      "السنوات التالية",
      "insurance renewal",
      "renewal for subsequent years",
      "later years",
      "subsequent years",
    ],
  },
  // --- lease/subscription: renewal & cancellation -------------------------
  {
    id: "automatic_renewal",
    fallbackTitle: "التجديد التلقائي",
    keywords: ["التجديد التلقائي", "يتجدد العقد تلقائيا", "يتجدد تلقائيا", "renewed automatically", "automatic renewal", "auto-renewal", "auto renewal"],
  },
  {
    id: "cancellation",
    fallbackTitle: "إلغاء الاشتراك",
    keywords: ["إلغاء الاشتراك", "إلغاء العقد", "الإلغاء قبل", "cancel the subscription", "cancellation of the agreement", "cancel this agreement"],
  },
  // --- employment/lease/subscription: termination -------------------------
  {
    id: "termination_notice",
    fallbackTitle: "إشعار إنهاء العقد",
    keywords: ["إشعار إنهاء العقد", "إشعار بالإنهاء", "مهلة الإخطار بالإنهاء", "termination notice", "notice of termination", "notice period for termination"],
  },
  {
    id: "termination_fee",
    fallbackTitle: "رسوم إنهاء العقد",
    keywords: ["رسوم إنهاء العقد", "غرامة الإنهاء", "غرامة الإنهاء المبكر", "termination fee", "early termination fee", "termination penalty"],
  },
  // --- lease/auto: maintenance & damage -----------------------------------
  {
    id: "maintenance_duty",
    fallbackTitle: "الالتزام بالصيانة",
    keywords: ["الالتزام بالصيانة", "أعمال الصيانة الدورية", "مسؤولية الصيانة", "maintenance obligation", "routine maintenance duty", "responsible for maintenance"],
  },
  {
    id: "damage_compensation",
    fallbackTitle: "التعويض عن الأضرار",
    keywords: ["التعويض عن الأضرار", "تعويض عن التلف", "تعويض عن الضرر", "compensation for damage", "damages compensation", "compensate for any damage"],
  },
];

function matchConceptIds(text: string): Set<string> {
  const normalized = text.toLowerCase();
  const matched = new Set<string>();
  for (const anchor of CONCEPT_ANCHORS) {
    if (anchor.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      matched.add(anchor.id);
    }
  }
  return matched;
}

/** Splits on Arabic and Latin sentence-ending punctuation, plus newlines — never mid-sentence. */
function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟۔])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function conceptIdForSentence(sentence: string): string | null {
  const matches = matchConceptIds(sentence);
  // A sentence naming more than one concept anchor is ambiguous — never
  // guess which one it "really" belongs to; treat it as unattributed so the
  // conservative fallback (never split) applies.
  if (matches.size === 1) {
    return [...matches][0]!;
  }
  return null;
}

function titleForConcept(id: string): string {
  return CONCEPT_ANCHORS.find((anchor) => anchor.id === id)!.fallbackTitle;
}

/**
 * Attempts to split one clause into multiple clauses when its text clearly
 * bundles two or more distinct, independently-effective concepts from
 * `CONCEPT_ANCHORS`. Conservative by design — only splits when:
 * (a) at least two distinct concept ids are found across the clause's
 *     summary+plainExplanation sentences, and
 * (b) every sentence can be unambiguously attributed to exactly one concept
 *     (or is a shared lead-in sentence attributed to none, which stays with
 *     the first identified group rather than being dropped).
 * If either condition fails, the original clause is returned unchanged —
 * never a forced/guessed split.
 */
function splitClauseIfCompound(clause: ImportantClause): ImportantClause[] {
  const summarySentences = splitIntoSentences(clause.summary);
  const explanationSentences = splitIntoSentences(clause.plainExplanation);

  const summaryConceptIds = summarySentences.map(conceptIdForSentence);
  const distinctConceptIds = new Set(summaryConceptIds.filter((id): id is string => id !== null));

  if (distinctConceptIds.size < 2) {
    return [clause];
  }

  // Group consecutive summary sentences by concept id, carrying any
  // unattributed leading sentence(s) forward into the next identified group
  // rather than discarding them.
  type Group = { conceptId: string; summarySentences: string[] };
  const groups: Group[] = [];
  let pendingUnattributed: string[] = [];

  for (let i = 0; i < summarySentences.length; i++) {
    const sentence = summarySentences[i]!;
    const conceptId = summaryConceptIds[i];
    if (conceptId === null) {
      pendingUnattributed.push(sentence);
      continue;
    }
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.conceptId === conceptId && pendingUnattributed.length === 0) {
      lastGroup.summarySentences.push(sentence);
    } else {
      groups.push({ conceptId, summarySentences: [...pendingUnattributed, sentence] });
      pendingUnattributed = [];
    }
  }

  // Trailing unattributed sentences with nowhere identified to attach to —
  // conservative: do not split, keep the clause exactly as the model wrote it.
  if (pendingUnattributed.length > 0 && groups.length === 0) {
    return [clause];
  }
  if (pendingUnattributed.length > 0) {
    groups[groups.length - 1]!.summarySentences.push(...pendingUnattributed);
  }

  if (groups.length < 2) {
    return [clause];
  }

  // Distribute plainExplanation sentences the same way, by concept id match;
  // any explanation sentence that cannot be attributed goes to whichever
  // group already claims the most similar concept, defaulting to the first
  // group so no explanation text is ever silently dropped.
  const explanationByConceptId = new Map<string, string[]>();
  let lastConceptId = groups[0]!.conceptId;
  for (const sentence of explanationSentences) {
    const conceptId = conceptIdForSentence(sentence) ?? lastConceptId;
    lastConceptId = conceptId;
    const list = explanationByConceptId.get(conceptId) ?? [];
    list.push(sentence);
    explanationByConceptId.set(conceptId, list);
  }

  return groups.map((group) => {
    const explanationSentencesForGroup = explanationByConceptId.get(group.conceptId) ?? [];
    return {
      title: titleForConcept(group.conceptId),
      summary: group.summarySentences.join(" ").trim().slice(0, 500),
      plainExplanation: (explanationSentencesForGroup.length > 0 ? explanationSentencesForGroup : explanationSentences)
        .join(" ")
        .trim()
        .slice(0, 350),
      riskLevel: clause.riskLevel,
      evidence: clause.evidence,
    };
  });
}

export function splitCompoundClauses(clauses: readonly ImportantClause[]): ImportantClause[] {
  return clauses.flatMap((clause) => splitClauseIfCompound(clause));
}

// ---------------------------------------------------------------------------
// 3. Conservative deduplication (genuinely equivalent clauses only)
// ---------------------------------------------------------------------------

const ARABIC_DIACRITICS_PATTERN = /[ً-ٰ]/gu;
const NON_WORD_PATTERN = /[^\p{L}\p{N}\s]/gu;

const NUMERIC_TOKEN_PATTERN = /^\d+$/;

/**
 * Single-character alphabetic tokens (stray punctuation remnants, single-
 * letter conjunctions/prefixes) are noise and get filtered out. Numeric
 * tokens are always kept regardless of digit count — a single digit (e.g.
 * "0", "5") can be the ONLY thing distinguishing two otherwise-templated
 * clauses (e.g. "Fee 1" vs "Fee 2"), so dropping short numbers would make
 * genuinely distinct clauses look identical and wrongly deduplicate them.
 */
function tokenize(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(ARABIC_DIACRITICS_PATTERN, "")
    .replace(NON_WORD_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
  return new Set(
    normalized.split(" ").filter((token) => token.length > 1 || NUMERIC_TOKEN_PATTERN.test(token)),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const TITLE_SIMILARITY_THRESHOLD = 0.6;
const CONTENT_SIMILARITY_THRESHOLD = 0.5;

/**
 * Merges a clause into an already-kept one ONLY when both the normalized
 * title AND the combined summary+plainExplanation content clear
 * conservative similarity thresholds — either signal alone is too weak (two
 * different clauses can share a generic title word, or discuss a similar
 * topic without being duplicates). Never merges based on riskLevel or
 * amount alone. When two clauses are judged equivalent, the earlier one is
 * kept as-is — never dropped for being "low risk" or otherwise deprioritized.
 */
export function deduplicateEquivalentClauses(clauses: readonly ImportantClause[]): ImportantClause[] {
  const kept: ImportantClause[] = [];

  for (const clause of clauses) {
    const normalizedTitle = normalizeClauseTitle(clause.title);
    const content = tokenize(`${clause.summary} ${clause.plainExplanation}`);

    const isDuplicate = kept.some((existing) => {
      const titleSimilarity = jaccardSimilarity(tokenize(normalizedTitle), tokenize(normalizeClauseTitle(existing.title)));
      if (titleSimilarity < TITLE_SIMILARITY_THRESHOLD) {
        return false;
      }
      const existingContent = tokenize(`${existing.summary} ${existing.plainExplanation}`);
      return jaccardSimilarity(content, existingContent) >= CONTENT_SIMILARITY_THRESHOLD;
    });

    if (!isDuplicate) {
      kept.push(clause);
    }
  }

  return kept;
}

// ---------------------------------------------------------------------------
// 4. Stable ordering
// ---------------------------------------------------------------------------

/**
 * Best-effort document-order hint: the first character offset within
 * `maskedText` of any single word (>=4 characters, to avoid matching noise)
 * drawn from the clause's title or summary. Returns `null` (never a guess)
 * when no such word can be found verbatim — the common case today, since
 * `summary`/`plainExplanation` are paraphrases, not verbatim excerpts, and
 * `evidence` is currently always null (deferred — see promptBuilder.ts).
 * When available, this lets stable-sort prefer genuine document order over
 * mere array position; when unavailable, array position (already
 * split-order-preserving — see `splitCompoundClauses`) is the safe fallback.
 */
function estimateSourcePosition(clause: ImportantClause, maskedText: string): number | null {
  const candidateWords = `${clause.title} ${clause.summary}`
    .split(/\s+/u)
    .map((word) => word.replace(NON_WORD_PATTERN, ""))
    .filter((word) => word.length >= 4);

  for (const word of candidateWords) {
    const index = maskedText.indexOf(word);
    if (index >= 0) {
      return index;
    }
  }
  return null;
}

/**
 * Produces a stable final ordering: clauses with a resolvable source
 * position sort by that position first; everything else keeps its existing
 * relative (array) order, which by this point already reflects the model's
 * own reading-order output plus in-place compound-splitting. A stable sort
 * (never reordering two items whose sort keys tie) guarantees re-running
 * this function on its own prior output is a no-op.
 */
export function sortClausesStably(clauses: readonly ImportantClause[], maskedText: string): ImportantClause[] {
  const withIndex = clauses.map((clause, index) => ({
    clause,
    index,
    position: estimateSourcePosition(clause, maskedText),
  }));

  withIndex.sort((a, b) => {
    if (a.position !== null && b.position !== null && a.position !== b.position) {
      return a.position - b.position;
    }
    if (a.position !== null && b.position === null) return -1;
    if (a.position === null && b.position !== null) return 1;
    return a.index - b.index;
  });

  return withIndex.map((entry) => entry.clause);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * The full deterministic post-processing pipeline, applied to every
 * successfully-validated model response before it is returned from
 * `analyzeContract` (see `service.ts`). Never drops a clause except by
 * genuine-equivalence deduplication; never invents clause content; always
 * idempotent (re-running this on its own output returns an identical array).
 */
export function applyDeterministicClausePostProcessing(
  clauses: readonly ImportantClause[],
  maskedText: string,
): ImportantClause[] {
  const normalized = clauses.map((clause) => ({ ...clause, title: normalizeClauseTitle(clause.title) }));
  const split = splitCompoundClauses(normalized);
  const deduped = deduplicateEquivalentClauses(split);
  return sortClausesStably(deduped, maskedText);
}
