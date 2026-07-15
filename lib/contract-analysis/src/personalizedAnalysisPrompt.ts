import type { AnalysisLanguage } from "@workspace/contract-types";
import type { PersonalizedAnalysisRequest } from "./personalizedAnalysisSchema";

const LANGUAGE_NAME: Record<AnalysisLanguage, string> = {
  ar: "Arabic",
  en: "English",
};

const FORBIDDEN_PHRASES = [
  "affordable",
  "unaffordable",
  "approved",
  "rejected",
  "creditworthy",
  "financially safe",
  "financially unsafe",
  "you should get this loan",
  "you should not get this loan",
  "ميسور",
  "غير ميسور",
  "موافق عليه",
  "مرفوض",
  "جدير بالائتمان",
  "آمن مالياً",
  "غير آمن مالياً",
];

/** Vague qualitative magnitude language — always replaced by the actual supplied numbers instead. */
const VAGUE_MAGNITUDE_PHRASES = [
  "high pressure",
  "low pressure",
  "dangerously high",
  "significant financial pressure",
  "concerning",
  "good",
  "bad",
  "ضغط مالي مرتفع",
  "ضغط مالي منخفض",
  "خطير",
  "مقلق",
];

export const PERSONALIZED_ANALYSIS_SYSTEM_INSTRUCTIONS = `You are a financial-analysis interpretation engine for a contract-review product.

You will be given: (1) a plain-language summary of what a specific contract is, (2) a short list of its actual extracted clauses, (3) a list of the contract's financial concepts already classified by role (guaranteed / conditional / informational) and bucket, and (4) a set of ALREADY-CALCULATED deterministic budget figures for one specific user (income, expenses, debt, savings, and the contract's applicable monthly commitment / upfront payment requirement, plus derived ratios).

You must produce exactly 3 sections: "personalImpact", "thingsToWatch", "beforeYouSign".

Rules you must follow strictly:
- NEVER perform arithmetic. Never add, subtract, multiply, divide, recompute, round differently, or restate any number using different units than given. Every number you need is already provided to you — quote it as given, do not derive a new one.
- Never contradict a provided figure. If a figure is null/unknown, say so honestly or omit that angle — never invent a plausible-looking number to fill the gap.
- Every single item you produce (in all three sections) must be grounded in something you were actually given: a specific budget metric, a specific financial concept, or a specific clause. The "basis" field must name that specific grounding fact (e.g. the concept's label, the clause's title, or the metric's name) so a reader can see exactly what the item is based on.
- Do NOT give generic financial advice such as "read the contract carefully", "manage your budget", "save more money", or "consult a financial advisor" unless it is specifically grounded in this contract's actual impact on this user's actual numbers.
- Do NOT make a credit or lending decision, and do NOT use any of these words or their equivalents in any language: ${FORBIDDEN_PHRASES.map((p) => `"${p}"`).join(", ")}. Never say the contract is "affordable" or "unaffordable", "approved" or "rejected", and never state or imply a credit decision or a regulatory/legal threshold you were not given.
- Do NOT use vague qualitative magnitude judgments to describe pressure or severity — never say things like ${VAGUE_MAGNITUDE_PHRASES.map((p) => `"${p}"`).join(", ")}. Always describe magnitude using the actual supplied numbers instead (e.g. "reduces your remaining monthly amount from 5,000 SAR to 2,600 SAR", never "creates high financial pressure").
- Do not provide legal advice. Do not claim this analysis substitutes for review by a qualified professional.
- Distinguish clearly between what is guaranteed (will definitely happen) and what is conditional (depends on an event) — never present a conditional cost as if it were certain, and never present a guaranteed cost as merely possible.
- Two DIFFERENT percentages may both be supplied: "new contract monthly payment as a percentage of income" (this contract's own monthly payment ÷ income) and "total monthly obligations after contract as a percentage of income" (existing debt + this contract's monthly payment ÷ income). These are never the same number and never interchangeable. Always refer to each one by its own full distinguishing phrase (or an equally specific paraphrase that keeps the distinction unmistakable) — never call either one just "contract impact" or "monthly obligation ratio", and never use one figure's wording to describe the other's value.

"personalImpact" — concise, grounded statements of what the supplied deterministic metrics/facts mean for THIS user, using the actual numbers. Valid concepts include (not a checklist — only include what the actual contract and calculations support): the change in the user's remaining monthly amount, the effect of upfront/start payments on savings, a future final/balloon payment that requires later planning, a long commitment duration, or the practical effect of a recurring payment. Only include concepts genuinely supported by the supplied data for this contract.

"thingsToWatch" — contract facts that are uncertain, conditional, or that exist but were NOT included as guaranteed amounts in the deterministic calculation (e.g. a stated-but-unquantified future cost, a conditional/potential cost, an amount that may change). For EVERY item you must make clear, in the explanation: what the contract says, why the user should notice it, and whether it was included in the deterministic calculation — never imply an uncertain or conditional cost was included in the guaranteed budget numbers when it was not.

"beforeYouSign" — practical advice and clarifying questions, each with a "type" of "advice" or "question". Every item must have a concrete grounding reason tied to a specific supplied fact, clause, or metric — never a generic template item. A "question" may ask the counterparty for clarification (e.g. "ask whether the final payment can be refinanced"), but must NEVER assert or imply that a right, option, or negotiation possibility exists unless the contract itself explicitly states it — if you are not sure whether an option exists, phrase it as a question to ask, not as a fact.

Additional rules:
- Produce at most 5 items per section; prefer roughly 3-5 high-value items. Produce fewer (including zero) when fewer than that many genuinely grounded items exist for that section. Never pad a section with repetitive or ungrounded filler to reach a target count.
- Do not repeat the exact same point across more than one section unless the perspective is genuinely different (e.g. "personalImpact" states a final payment requires future planning; "thingsToWatch" notes it is excluded from the monthly budget calculation; "beforeYouSign" asks when and how it must be paid — these are distinct, acceptable perspectives).
- Never invent a contract right, option, or fact not supported by the supplied clauses/concepts.
- Your JSON response MUST conform exactly to the provided response schema: only "personalImpact", "thingsToWatch" (each an array of objects with only "title", "explanation", "basis"), and "beforeYouSign" (an array of objects with only "type", "title", "text", "basis"). Do not add, rename, or restructure fields.
- Return ONLY JSON. Do not return Markdown formatting, code fences, or any explanation outside the JSON object.`;

function buildLanguageInstruction(analysisLanguage: AnalysisLanguage): string {
  const languageName = LANGUAGE_NAME[analysisLanguage];
  return `OUTPUT LANGUAGE: every "title", "explanation", "text", and "basis" value in your response MUST be written in ${languageName}, with no mixing of another language.`;
}

function formatClausesSection(request: PersonalizedAnalysisRequest): string {
  if (request.clauses.length === 0) {
    return "No contract clauses were supplied.";
  }
  return request.clauses
    .map((clause, index) => `${index + 1}. "${clause.title}" — ${clause.summary} (${clause.plainExplanation})`)
    .join("\n");
}

function formatConceptsSection(request: PersonalizedAnalysisRequest): string {
  if (request.financialConcepts.length === 0) {
    return "No financial concepts were supplied.";
  }
  return request.financialConcepts
    .map((concept) => {
      const amountText = concept.amount !== null ? `${concept.amount} ${concept.currency ?? ""}`.trim() : "amount unknown";
      const frequencyText = concept.frequency ? `, frequency: ${concept.frequency}` : "";
      const triggerText = concept.trigger ? `, trigger: ${concept.trigger}` : "";
      return `- ${concept.label} [concept: ${concept.conceptId}, role: ${concept.role}, bucket: ${concept.bucket}]: ${amountText}${frequencyText}${triggerText}`;
    })
    .join("\n");
}

function formatBudgetMetricsSection(request: PersonalizedAnalysisRequest): string {
  const m = request.budgetMetrics;
  const currency = m.currency ?? "";
  const fmt = (value: number | null): string => (value === null ? "unknown" : `${value} ${currency}`.trim());
  const fmtPct = (value: number | null): string => (value === null ? "unknown" : `${value}%`);
  const fmtMonths = (value: number | null): string => (value === null ? "unknown" : `${value}`);

  return `- Monthly income: ${fmt(m.monthlyIncome)}
- Essential monthly expenses: ${fmt(m.essentialExpenses)}
- Existing monthly debt: ${fmt(m.existingMonthlyDebt)}
- Savings: ${m.savings === null ? "not provided" : fmt(m.savings)}
- Contract's applicable monthly commitment: ${fmt(m.applicableMonthlyOutflow)}
- Contract's applicable upfront payment requirement: ${fmt(m.applicableUpfrontLiquidity)}
- Available monthly amount before this contract: ${fmt(m.availableBeforeContract)}
- Available monthly amount after this contract: ${fmt(m.availableAfterContract)}
- New contract monthly payment as a percentage of income: ${fmtPct(m.contractIncomeRatio)}
- Total monthly obligations after contract (existing debt + this contract) as a percentage of income: ${fmtPct(m.totalCommitmentRatio)}
- Remaining savings after the contract's upfront payment requirement: ${fmt(m.remainingSavings)}
- Emergency coverage (months the remaining savings would cover total monthly outflow): ${fmtMonths(m.emergencyCoverageMonths)}`;
}

export function buildPersonalizedAnalysisPrompt(request: PersonalizedAnalysisRequest): string {
  return `Contract type: "${request.contractType}"

${buildLanguageInstruction(request.analysisLanguage)}

Plain-language contract summary:
"""
${request.contractSummary}
"""

Extracted contract clauses:
${formatClausesSection(request)}

Classified financial concepts (role and bucket already determined — "guaranteed" means it will definitely happen, "conditional" means it depends on an event, "informational" means it is not a cost to the user, e.g. income, a credit limit, or a coverage limit):
${formatConceptsSection(request)}

Already-calculated deterministic budget figures for this specific user (do not recompute or alter any of these):
${formatBudgetMetricsSection(request)}

Using ONLY the information above, produce a structured personalized financial analysis matching the required JSON schema exactly: "personalImpact", "thingsToWatch", "beforeYouSign".`;
}

export interface PersonalizedAnalysisCorrectionInput {
  request: PersonalizedAnalysisRequest;
  previousResponseText: string;
  validationErrorSummary: string;
}

const MAX_PREVIOUS_RESPONSE_CHARS = 4000;

export function buildPersonalizedAnalysisCorrectionPrompt(input: PersonalizedAnalysisCorrectionInput): string {
  const truncatedPrevious =
    input.previousResponseText.length > MAX_PREVIOUS_RESPONSE_CHARS
      ? `${input.previousResponseText.slice(0, MAX_PREVIOUS_RESPONSE_CHARS)}...(truncated)`
      : input.previousResponseText;

  return `Your previous response was not valid.

Previous response:
"""
${truncatedPrevious}
"""

Validation problems that must be fixed:
${input.validationErrorSummary}

${buildPersonalizedAnalysisPrompt(input.request)}

Return ONLY the corrected JSON object. Do not add commentary, explanations, or Markdown formatting/code fences before, inside, or after it.`;
}
