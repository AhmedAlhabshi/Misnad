import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import { CONTRACT_TYPE_LABELS_EN } from "@workspace/contract-types";

const USER_FACING_GENERATED_FIELDS = [
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
  "extractedNumbers[].label",
  "missingInformation[].reason",
  "extractionNotes",
] as const;

const LANGUAGE_NAME: Record<AnalysisLanguage, string> = {
  ar: "Arabic",
  en: "English",
};

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
- BE CONCISE AND MATERIAL. Extract the contract's material contractual and financial information — this is not an exercise in exhaustively enumerating every number, every defined term, or every blank field in a template contract. Do not repeat the same fact in more than one section. Do not explain or restate the contract's definitions section. Do not create an entry for every blank/unfilled placeholder in a template contract.
- Respect these maximum array lengths. If the contract has more candidate items than the limit, select the MOST MATERIALLY IMPORTANT ones — not simply the first ones you encounter: "parties" ≤ 6 items, "financialObligations" ≤ 12 items, "dates" ≤ 12 items, "penalties" ≤ 10 items, "fees" ≤ 10 items, "importantClauses" ≤ 10 items, "extractedNumbers" ≤ 20 items, "missingInformation" ≤ 15 items.
- Respect these maximum text lengths (characters), and write within them directly — never write a longer value expecting it to be shortened afterward: party "role" ≤ 100, party "notes" ≤ 300, "description"/"label"/"frequency" fields ≤ 250, clause "title" ≤ 180, clause "summary" ≤ 500, clause "evidence" ≤ 350, penalty "condition" ≤ 600, "missingInformation.reason" ≤ 300, "extractionNotes" ≤ 700.
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
): string {
  const label = CONTRACT_TYPE_LABELS_EN[contractType];

  return `The contract type you must use for this analysis is: "${contractType}" (${label}).

${buildAnalysisLanguageInstruction(analysisLanguage)}

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
}

const MAX_PREVIOUS_RESPONSE_CHARS = 4000;

export function buildCorrectionPrompt(input: CorrectionPromptInput): string {
  const truncatedPrevious =
    input.previousResponseText.length > MAX_PREVIOUS_RESPONSE_CHARS
      ? `${input.previousResponseText.slice(0, MAX_PREVIOUS_RESPONSE_CHARS)}...(truncated)`
      : input.previousResponseText;

  return `Your previous response for contract type "${input.contractType}" was not valid.

Previous response:
"""
${truncatedPrevious}
"""

Validation problems that must be fixed:
${input.validationErrorSummary}

The masked contract text is still the ONLY source of truth for this correction — it has not changed since your previous response. Do not claim it is missing.

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
