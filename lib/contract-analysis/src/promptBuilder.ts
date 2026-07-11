import type { ContractType } from "@workspace/contract-types";
import { CONTRACT_TYPE_LABELS_EN } from "@workspace/contract-types";

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
- The "detectedContractType" field is different: it is your own independent classification of what the contract actually appears to be, based only on the masked contract text. Do NOT simply copy the contract type you were told to use into this field — inspect the content and decide for yourself. Choose exactly one of: "auto_finance", "credit_card", "mortgage", "personal_finance", "lease", "insurance", "employment", "subscription", or "other". If the text does not clearly indicate one of these types, use "other".
- Only extract the type-specific details that are relevant to the given contract type; leave other type-specific fields null.
- Your JSON response MUST conform exactly to the provided response schema: use only the fields defined in that schema, with the exact field names given. Do not add, rename, or restructure fields.
- Return ONLY JSON. Do not return Markdown formatting, code fences, or any explanation outside the JSON object.
- Do not provide legal advice.
- Do not claim that this analysis is a substitute for review by a qualified professional.`;

export function buildAnalysisPrompt(
  maskedText: string,
  contractType: ContractType,
): string {
  const label = CONTRACT_TYPE_LABELS_EN[contractType];

  return `The contract type you must use for this analysis is: "${contractType}" (${label}).

Separately, independently classify the contract's apparent type from its actual content and report it in "detectedContractType" — this may or may not match "${contractType}"; do not assume they match.

Analyze the following masked contract text and extract a structured contract understanding result that matches the required JSON schema exactly.

Masked contract text:
"""
${maskedText}
"""`;
}

export interface CorrectionPromptInput {
  maskedText: string;
  contractType: ContractType;
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

Return the corrected, complete result again as a single valid JSON object matching the required schema exactly. Do not return Markdown or any explanation outside the JSON object.`;
}
