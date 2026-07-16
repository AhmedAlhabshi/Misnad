import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import { CONTRACT_TYPE_LABELS_EN } from "@workspace/contract-types";

const USER_FACING_GENERATED_FIELDS = [
  "contractSummary",
  "contractSummarySimple",
  "parties[].role",
  "parties[].notes",
  "financialObligations[].description",
  "financialObligations[].frequency",
  "dates[].label",
  "dates[].notes",
  "penalties[].description",
  "penalties[].condition",
  "fees[].description",
  "importantClauses[].title",
  "importantClauses[].summary",
  "importantClauses[].plainExplanation",
  "extractedNumbers[].label",
  "missingInformation[].reason",
  "extractionNotes",
] as const;

const LANGUAGE_NAME: Record<AnalysisLanguage, string> = {
  ar: "Arabic",
  en: "English",
};

/**
 * Structurally mirrors `@workspace/document-ocr`'s `RecoveredFinancialValue`
 * (deliberately not imported from that package — contract-analysis has no
 * other dependency on document-ocr, and this prompt-building code only
 * needs the shape, not the package). Callers (api-server) pass the document
 * extraction's own recovered values directly; TypeScript's structural typing
 * accepts them without any conversion.
 */
export interface DeterministicRecoveryNote {
  field: string;
  value: number | null;
  unit: string;
  status: "direct" | "recovered" | "ambiguous" | "missing";
  confidence: "high" | "medium" | "low";
  source: string;
  evidence: string[];
}

/**
 * Renders a "DETERMINISTIC OCR RECOVERY NOTES" block for values a
 * deterministic (non-AI) recovery pass already resolved from corrupted OCR
 * digits — e.g. reading "0 ريال (مائة وعشرون ألف ريال)" as 120,000 from the
 * parenthetical amount-in-words. Only `direct`/`recovered` values with a
 * non-null number are listed; `ambiguous`/`missing` fields say nothing
 * useful (the model's own "never invent" instructions already cover them)
 * and are omitted to avoid noise. Returns `null` when there is nothing to
 * report, so the prompt stays exactly as before for documents where this
 * recovery pass never found anything (the common case — most contracts
 * either extract cleanly or have no tracked financial label at all).
 */
function buildRecoveryNotesSection(notes: readonly DeterministicRecoveryNote[] | undefined): string | null {
  if (!notes || notes.length === 0) {
    return null;
  }
  const usable = notes.filter((note) => (note.status === "direct" || note.status === "recovered") && note.value !== null);
  if (usable.length === 0) {
    return null;
  }

  const lines = usable.map((note) => {
    const evidence = note.evidence.length > 0 ? note.evidence.join("; ") : "no further evidence recorded";
    return `- ${note.field}: ${note.value} ${note.unit} (confidence: ${note.confidence}, source: ${note.source}) — ${evidence}`;
  });

  return `DETERMINISTIC OCR RECOVERY NOTES (machine-generated, NOT part of the contract itself):
A deterministic, non-AI text-recovery pass identified the following financial values from OCR text that had corrupted digits, using evidence such as an amount spelled out in words, a repeated installment-table figure, or arithmetic consistency between related values — never a guess:
${lines.join("\n")}

How to use these notes:
- Prefer what you can read directly and reliably in the masked contract text below over these notes — these notes exist only to help when the OCR digits for a field are genuinely unclear or contradictory.
- Only use a note's value when you cannot otherwise confidently read that field, and only trust "confidence: high" notes; treat "confidence: medium"/"low" as a hint to look more carefully at the text, not as a value to copy in directly.
- These notes are recovery hints, not verified facts. If a note conflicts with what the masked text otherwise shows, or you are not confident, follow your normal rule: use null rather than guessing.
- Never use these notes to fill in a field they do not mention — the absence of a field here is not evidence of anything.`;
}

function buildAnalysisLanguageInstruction(analysisLanguage: AnalysisLanguage): string {
  const languageName = LANGUAGE_NAME[analysisLanguage];
  const fieldList = USER_FACING_GENERATED_FIELDS.map((field) => `"${field}"`).join(", ");

  return `OUTPUT LANGUAGE (analysisLanguage = "${analysisLanguage}"): every one of the following user-facing, AI-generated natural-language fields MUST be written in ${languageName}, with no exceptions and no mixing in another language: ${fieldList}. This applies even when the contract itself is written in a different language — you must still generate these fields in ${languageName}.
Do NOT translate or change the language of: JSON property names; canonical enum values ("contractType", "riskLevel"); PII placeholders such as "[NATIONAL_ID]", "[IBAN]", "[PHONE]", "[EMAIL]", "[IQAMA]", "[BANK_ACCOUNT]"; and raw extracted names, dates, amounts, identifiers, or currencies (keep those exactly as they appear in the source text). Note: "importantClauses[].evidence" must be null for now regardless of language (evidence extraction is deferred this milestone — see the rules below).`;
}

export const SYSTEM_INSTRUCTIONS = `You are a contract understanding engine.

Rules you must follow strictly:
- The masked contract text given to you in this request is the ONLY source of truth. Do not use any other document, example, memory of prior requests, or outside knowledge of the parties or document.
- Never invent or guess names, roles, amounts, dates, addresses, or any other value that is not explicitly present in the provided text.
- Never infer amounts or dates without clear evidence in the text.
- If a value is not explicitly present in the text, its field MUST be null (or an empty array, for list fields) — never fabricate a plausible-looking value to fill it in.
- Use null or the schema's allowed empty values whenever information is missing.
- Add every piece of missing information to "missingInformation".
- Add any text or extraction problems you notice to "extractionNotes".
- Keep any quotes or evidence short.
- The "contractType" field in your output must exactly match the contract type you are told to use.
- The "typeDetails.contractType" field must also exactly match that same contract type.
- Only extract the type-specific details that are relevant to the given contract type; leave other type-specific fields null.
- For each item in "importantClauses", the "evidence" field MUST be null for now. Evidence extraction is deferred for this milestone — do NOT attempt to extract, paraphrase, reconstruct, or generate any excerpt for "evidence" under any circumstance, even if you are confident you have identified a supporting passage. Always set "evidence" to null for every clause in this response.
- "contractSummary": write 1-3 sentences explaining, in plain language, what kind of contractual relationship this specific contract is, who generally provides what, what the user is agreeing to, and how it works at a high level — grounded only in what this contract actually says. This is a plain-language contract explanation, not a financial summary: do not lead with or emphasize monetary totals, ratios, or a "dashboard" framing of amounts. Avoid unnecessary legal jargon — write for a normal reader with no legal or financial background. Never force this contract's real content into a template written for a different kind of agreement.
- "contractSummarySimple": rewrite the same explanation in the simplest possible everyday language, as if explaining it to someone with no legal or financial background — shorter sentences, common everyday words, no jargon, no defined-term names. Explain any legal or financial term instead of repeating it. It must still be grounded in this contract's actual content, not a generic disclaimer, and must not invent examples, rights, obligations, or consequences the contract does not actually contain.
- "importantClauses" must include EVERY distinct clause actually present in the contract that has real practical meaning for the user — obligations, rights, restrictions, fees, timelines, conditions, terminations, renewals, liabilities, exclusions, coverage, deposits, notice periods, confidentiality, and so on are only illustrative examples, not a fixed checklist; extract whatever clause types this specific contract actually contains, and never force a category from this list onto a contract that does not contain it. Do not artificially limit yourself to a small handful of "top" clauses when the contract genuinely contains more distinct, meaningful provisions — a contract with 14 meaningful clauses should produce 14 entries, not fewer. Only skip a passage when it is purely definitional/boilerplate with no independent practical effect, or when it would merely duplicate a clause you already extracted. If, and only if, the contract genuinely contains more distinct meaningful clauses than the "importantClauses" limit below, then prioritize the most materially important ones up to that limit.
- DETERMINISTIC CLAUSE BOUNDARY RULE (apply this consistently, the same way every time you see the same text): a separate legal or financial obligation, right, restriction, penalty, fee, or condition MUST be represented as its own separate clause entry whenever it has an independent effect — i.e. it could be removed, changed, or violated without changing whether any other provision applies. Never merge two or more independently-effective provisions into a single clause entry merely because they appear in the same paragraph, sentence, or numbered item of the source contract — paragraph boundaries in the source text are a formatting artifact, not a boundary for how many clauses to extract. For example, a paragraph that both (a) states a late-payment notice requirement and (b) caps collection costs instead of a fixed penalty describes two independent clauses, not one, even though they are adjacent; likewise a paragraph covering both asset ownership and insurance coverage describes two independent clauses. Conversely, do not artificially fragment a single genuinely-unified provision (e.g. one condition with several sub-details that only make sense together) into multiple clauses just to inflate the count.
- For each item in "importantClauses", "plainExplanation" must explain the practical, everyday meaning of that specific clause for the user — not a repeat of "summary", not legal or financial advice, not a generic statement that could apply to any contract. Write it the way you would explain the clause's real-world consequence to a bright reader with no legal or financial background: short sentences, common everyday words, and explain rather than repeat any legal or financial term. Do not merely reword "summary" with synonyms — genuinely reduce the complexity and focus on what the clause practically means for the user. Ground it only in what that clause specifically says; never invent examples, rights, obligations, penalties, or consequences the clause does not actually establish.
- BE CONCISE AND MATERIAL. Extract the contract's material contractual and financial information — this is not an exercise in exhaustively enumerating every number, every defined term, or every blank field in a template contract. Do not repeat the same fact in more than one section. Do not explain or restate the contract's definitions section. Do not create an entry for every blank/unfilled placeholder in a template contract.
- Respect these maximum array lengths. If the contract has more candidate items than the limit, select the MOST MATERIALLY IMPORTANT ones — not simply the first ones you encounter: "parties" ≤ 6 items, "financialObligations" ≤ 12 items, "dates" ≤ 12 items, "penalties" ≤ 10 items, "fees" ≤ 10 items, "importantClauses" ≤ 30 items, "extractedNumbers" ≤ 20 items, "missingInformation" ≤ 15 items.
- Respect these maximum text lengths (characters), and write within them directly — never write a longer value expecting it to be shortened afterward: "contractSummary" ≤ 500, "contractSummarySimple" ≤ 350, party "role" ≤ 100, party "notes" ≤ 300, "description"/"label"/"frequency" fields ≤ 250, clause "title" ≤ 180, clause "summary" ≤ 500, clause "plainExplanation" ≤ 350, clause "evidence" ≤ 350, penalty "condition" ≤ 600, "missingInformation.reason" ≤ 300, "extractionNotes" ≤ 700.
- "missingInformation" must contain ONLY high-value omissions that materially prevent the user from understanding the contract — for example: the financed amount, the monthly installment, the interest rate/APR, the contract duration, a balloon payment, an important party's identity, a key due date, or a major fee/penalty amount. Prefer simply leaving a "typeDetails" field as null over adding a "missingInformation" entry about it. Do NOT add a "missingInformation" entry for every null property in the schema, and never add more than one entry for the same underlying fact.
- "extractedNumbers" must contain ONLY numbers materially relevant to the user's financial obligations or deadlines: amounts, percentages, installment counts, contract durations, notice periods, payment deadlines, and penalty-related periods. Do NOT include legal citation numbers, royal decree numbers, circular numbers, page numbers, document/reference IDs, or article numbering — unless a specific such number directly and materially changes the user's contractual obligation.
- Your JSON response MUST conform exactly to the provided response schema: use only the fields defined in that schema, with the exact field names given. Do not add, rename, or restructure fields.
- Return ONLY JSON. Do not return Markdown formatting, code fences, or any explanation outside the JSON object.
- Do not provide legal advice.
- Do not claim that this analysis is a substitute for review by a qualified professional.`;

export function buildAnalysisPrompt(
  maskedText: string,
  contractType: ContractType,
  analysisLanguage: AnalysisLanguage,
  recoveryNotes?: readonly DeterministicRecoveryNote[],
): string {
  const label = CONTRACT_TYPE_LABELS_EN[contractType];
  const recoveryNotesSection = buildRecoveryNotesSection(recoveryNotes);

  return `The contract type you must use for this analysis is: "${contractType}" (${label}).

${buildAnalysisLanguageInstruction(analysisLanguage)}
${recoveryNotesSection ? `\n${recoveryNotesSection}\n` : ""}
Analyze the following masked contract text and extract a structured contract understanding result that matches the required JSON schema exactly.

Masked contract text:
"""
${maskedText}
"""`;
}

export interface CorrectionPromptInput {
  maskedText: string;
  contractType: ContractType;
  analysisLanguage: AnalysisLanguage;
  previousResponseText: string;
  validationErrorSummary: string;
  recoveryNotes?: readonly DeterministicRecoveryNote[];
}

const MAX_PREVIOUS_RESPONSE_CHARS = 4000;

export function buildCorrectionPrompt(input: CorrectionPromptInput): string {
  const truncatedPrevious =
    input.previousResponseText.length > MAX_PREVIOUS_RESPONSE_CHARS
      ? `${input.previousResponseText.slice(0, MAX_PREVIOUS_RESPONSE_CHARS)}...(truncated)`
      : input.previousResponseText;
  const recoveryNotesSection = buildRecoveryNotesSection(input.recoveryNotes);

  return `Your previous response for contract type "${input.contractType}" was not valid.

Previous response:
"""
${truncatedPrevious}
"""

Validation problems that must be fixed:
${input.validationErrorSummary}

The masked contract text is still the ONLY source of truth for this correction — it has not changed since your previous response. Do not claim it is missing.
${recoveryNotesSection ? `\n${recoveryNotesSection}\n` : ""}
Masked contract text:
"""
${input.maskedText}
"""

${buildAnalysisLanguageInstruction(input.analysisLanguage)}

This is your only remaining attempt, so completing a single valid JSON object matters more than exhaustive extraction:
- Return the FULL corrected JSON object from its opening "{" to its closing "}" — never stop partway through, and never return a fragment.
- Stay within every array-length and text-length limit stated above; if you are at risk of running out of room, remove low-value, repetitive, or less material items first rather than truncating the JSON itself.
- Prioritize completing a valid, well-formed JSON object over exhaustively capturing every possible detail — a complete but slightly less exhaustive result is far better than an incomplete or truncated one.
- Return ONLY the JSON object. Do not add commentary, explanations, or Markdown formatting/code fences before, inside, or after it.

Return the corrected, complete result again as a single valid JSON object matching the required schema exactly.`;
}
