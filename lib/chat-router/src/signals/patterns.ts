import { normalizeQuestion } from "../normalize/normalizeQuestion";

/**
 * Every phrase list below is written in ordinary Arabic/English spelling and
 * folded through the exact same `normalizeQuestion` pipeline used on the
 * live question at match time (see `phrase()`). This guarantees a
 * hand-typed pattern can never silently drift out of sync with how the
 * runtime text is normalized — there is only one normalization
 * implementation, used on both sides of every comparison.
 *
 * Design principle (why some "obvious" words are deliberately absent):
 * bare, highly generic words — Arabic "حق" (right/due), "نظام" (system/law),
 * "شرط" (condition/clause) — are NOT listed on their own anywhere in this
 * file. Each is either combined with other words into a longer, specific
 * phrase (e.g. "نظاميا" as "permitted under the regulations", not bare
 * "نظام"), or, where no safe combination exists (bare "حق", bare "شرط"),
 * left out entirely. This directly implements the requirement that routing
 * must never claim legal-answerability merely from a generic word — see
 * `RIGHTS_QUESTION_PHRASES` / `LEGAL_TERM_PHRASES` for the specific,
 * combined phrases used instead.
 */
function phrase(raw: string): string {
  return normalizeQuestion(raw);
}

function phrases(raw: string[]): string[] {
  return raw.map(phrase);
}

/** Signals the question is about the user's OWN uploaded contract (not a hypothetical or generic document). */
export const CONTRACT_OWNERSHIP_PHRASES: readonly string[] = phrases([
  "عقدي",
  "في عقدي",
  "بعقدي",
  "حسب عقدي",
  "وفق عقدي",
  "هذا العقد",
  "العقد الخاص بي",
  "حسب الملف",
  "حسب العقد",
  "في العقد",
  "في الملف",
  "my contract",
  "this contract",
  "the contract",
  "in my contract",
  "according to my contract",
  "according to the contract",
  "according to the document",
  "in the document",
  "in my file",
  "per my contract",
]);

/**
 * Contract-structure vocabulary: clause references, obligation/termination
 * wording, and party-role nouns — the category-1 subject matter
 * ("clause, payment, date, party, obligation, penalty, termination
 * condition, or wording inside the uploaded contract"). Bare "شرط"/"الشرط"
 * ("condition") is intentionally excluded — it's as generic as bare
 * "نظام" and matches unrelated everyday uses; "بند"/"clause"/"penalty" are
 * specific enough to keep.
 */
export const CONTRACT_STRUCTURE_PHRASES: readonly string[] = phrases([
  "بند",
  "البند",
  "الشرط الجزائي في عقدي",
  "فسخ العقد",
  "الإنهاء المبكر",
  "إنهاء العقد",
  "الطرف الآخر",
  "الأطراف",
  "الالتزام",
  "الالتزامات",
  "مدة العقد",
  "كم مدة العقد",
  "تاريخ التوقيع",
  "مستأجر",
  "مؤجر",
  "صاحب العمل",
  "مؤمن له",
  "مؤمن",
  "التأخر في السداد",
  "التأخر بالسداد",
  "التأخير في الدفع",
  "عدم السداد",
  // Contract expiry/duration date wording — every entry below is a full
  // phrase combining the date/time word with a contract-specific concept
  // (never a bare "متى"/"when" on its own — see module doc-comment and
  // `signals.test.ts`'s negative cases). Added after a live trace showed
  // "متى نهاية العقد؟" fell through to the "general" route with zero
  // signals, so Contract RAG was never queried even though the indexed
  // contract stated the last-installment date.
  "نهاية العقد",
  "تاريخ نهاية العقد",
  "تاريخ انتهاء العقد",
  "انتهاء العقد",
  "متى ينتهي العقد",
  "متى ينتهي",
  "متى نهاية العقد",
  "آخر قسط",
  "تاريخ آخر قسط",
  "بداية العقد",
  "تاريخ بداية العقد",
  "متى يبدأ العقد",
  "أول قسط",
  "تاريخ أول قسط",
  "clause",
  "this clause",
  "section",
  "termination",
  "early termination",
  "obligation",
  "party",
  "parties",
  "penalty",
  "this penalty",
  "payment terms",
  "contract duration",
  "how long is the contract",
  "signature date",
  "tenant",
  "landlord",
  "employer",
  "insured",
  "insurer",
  "late payment",
  // English contract expiry/duration date wording — same rule as the
  // Arabic block above: always a full phrase, never bare "when" alone.
  "contract end date",
  "contract expiry date",
  "when does the contract end",
  "when does the contract expire",
  "end of the contract",
  "expiry of the contract",
  "last installment date",
  "final payment date",
  "first installment date",
  "contract start date",
  "when does the contract start",
]);

/** Everyday financial vocabulary already covered by the financial-metrics engine's computed output. */
export const FINANCIAL_TERM_PHRASES: readonly string[] = phrases([
  "شهريا",
  "كل شهر",
  "القسط",
  "الأقساط",
  "الإجمالي",
  "التكلفة الإجمالية",
  "سنويا",
  "الرسوم",
  "رسوم التأخير",
  "رسوم التأخر",
  "النسبة",
  "معدل الفائدة",
  "الفائدة",
  "كم المبلغ",
  "كم سأدفع",
  "كم يجب أن أدفع",
  "monthly payment",
  "every month",
  "per month",
  "installment",
  "total cost",
  "total amount",
  "annual commitment",
  "yearly",
  "late fee",
  "late fees",
  "percentage",
  "interest rate",
  "apr",
  "exposure",
  "how much will i pay",
  "how much do i pay",
  "ratio",
]);

/**
 * Bare compute-trigger words ("how much", "كم") are too generic to count
 * alone (see module doc-comment) — they only strengthen a match already
 * carried by a `FINANCIAL_TERM_PHRASES` hit, they never create one by
 * themselves. Kept separate so `detectIntentSignals` can report which kind
 * of evidence fired.
 */
export const FINANCIAL_COMPUTE_TRIGGER_PHRASES: readonly string[] = phrases(["كم", "احسب", "how much", "calculate"]);

/**
 * Specific, regulation-flavored phrasing — never a bare "نظام" or "حق".
 * Each entry names an actual legal/regulatory concept (a rulebook, a
 * legality judgment, an official ceiling), not just "the word law exists
 * somewhere in this question".
 */
export const LEGAL_TERM_PHRASES: readonly string[] = phrases([
  "نظاميا",
  "الأنظمة السعودية",
  "نظام العمل",
  "نظام الإيجار",
  "اللائحة",
  "لائحة",
  "بموجب النظام",
  "وفقا للنظام",
  "يخالف النظام",
  "مسموح قانونيا",
  "قانوني",
  "غير قانوني",
  "ساما",
  "saudi law",
  "saudi regulation",
  "saudi regulations",
  "under saudi law",
  "under the law",
  "applicable law",
  "the law says",
  "governed by law",
  "regulation",
  "regulatory",
  "is this legal",
  "is it legal",
  "allowed under",
  "permitted under",
  "sama",
  "official limit",
  "maximum allowed by law",
]);

/**
 * The other contracting party, named generically enough to recognize a
 * rights dispute regardless of contract type. Deliberately bare word
 * stems ("مؤجر", not "المؤجر") — Arabic attaches prepositions directly to
 * the definite article and drops its alef (e.g. "المؤجر" + "ل" becomes
 * "للمؤجر", not "لالمؤجر"), so anchoring on "ال..." would miss the
 * inflected forms a real question actually uses.
 */
export const COMPARISON_ACTOR_PHRASES: readonly string[] = phrases([
  "مؤجر",
  "بنك",
  "شركة",
  "مؤمن",
  "جهة التمويل",
  "صاحب العمل",
  "الطرف الآخر",
  "the landlord",
  "the lender",
  "the bank",
  "the insurer",
  "the company",
  "the employer",
  "the other party",
]);

/**
 * Short stems (not full words) so common inflections match too — e.g.
 * "إخلا" matches both "إخلاء" (eviction, noun) and "إخلائي" (evicting me).
 */
export const COMPARISON_ACTION_STEM_PHRASES: readonly string[] = phrases([
  "إخلا",
  "فسخ",
  "إنها",
  "خصم",
  "رفض",
  "إلغا",
  "زياد",
  "evict",
  "terminate",
  "cancel",
  "deduct",
  "reject",
  "increase the rent",
]);

/** Explicit "am I entitled to / is this allowed" phrasing. */
export const RIGHTS_QUESTION_PHRASES: readonly string[] = phrases([
  "هل يحق",
  "هل من حق",
  "هل يجوز لـ",
  "ما حقوقي",
  "حقوقي بخصوص",
  "is this allowed",
  "am i entitled",
  "what are my rights",
  "is it permitted",
]);

/** Direct "compare X to the law" phrasing — on its own, enough to establish a contract-vs-legal comparison. */
export const COMPARISON_EXPLICIT_PHRASES: readonly string[] = phrases([
  "قارن",
  "مقارنة",
  "يتوافق مع النظام",
  "مطابق للنظام",
  "compare this",
  "compare the",
  "does this comply",
  "complies with the law",
]);

/** Pure "what does X mean" phrasing — used only to label a reason code; does not by itself change routing (see selectRoute.ts doc-comment). */
export const DEFINITIONAL_PHRASES: readonly string[] = phrases(["ما معنى", "ما هو مفهوم", "عرف لي", "what does", "what is a", "define"]);

/**
 * Instruction-override / cross-session-exfiltration attempts. Matching any
 * of these short-circuits routing to a safe "general" result regardless of
 * any other signal — see `selectRoute.ts`. This is defense-in-depth only:
 * the actual session isolation is enforced by Contract RAG's session
 * scoping, not by this router.
 */
export const INJECTION_PHRASES: readonly string[] = phrases([
  "تجاهل التعليمات",
  "تجاهل العقد",
  "اكشف عن جميع",
  "عقود المستخدمين الآخرين",
  "تجاوز التعليمات",
  "ignore the contract",
  "ignore previous instructions",
  "ignore all previous",
  "reveal all",
  "other users' contracts",
  "other users contracts",
  "all other users",
  "system prompt",
  "bypass",
  "disregard your instructions",
]);

export function includesAny(normalizedQuestion: string, list: readonly string[]): boolean {
  return list.some((entry) => normalizedQuestion.includes(entry));
}
