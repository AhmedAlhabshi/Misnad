import { isContractType, type ContractType } from "@workspace/contract-types";
import {
  getContractUnderstandingJsonSchemaFor,
  type ContractUnderstanding,
} from "@workspace/contract-schema";
import {
  emptyMaskedTextError,
  invalidContractTypeError,
  schemaValidationFailedError,
} from "./errors";
import { buildAnalysisPrompt, buildCorrectionPrompt, SYSTEM_INSTRUCTIONS } from "./promptBuilder";
import { parseJsonResponse, validateContractUnderstanding } from "./validate";
import type { ContractAnalysisProvider } from "./providers/types";
import { geminiContractAnalysisProvider } from "./providers/geminiProvider";

const MAX_ATTEMPTS = 2;

export interface AnalyzeContractOptions {
  provider?: ContractAnalysisProvider;
}

export async function analyzeContract(
  maskedText: string,
  contractType: ContractType,
  options: AnalyzeContractOptions = {},
): Promise<ContractUnderstanding> {
  if (typeof maskedText !== "string" || maskedText.trim().length === 0) {
    throw emptyMaskedTextError();
  }

  if (!isContractType(contractType)) {
    throw invalidContractTypeError();
  }

  const provider = options.provider ?? geminiContractAnalysisProvider;

  const jsonSchema = getContractUnderstandingJsonSchemaFor(contractType);

  const firstResponse = await provider.generate({
    systemInstructions: SYSTEM_INSTRUCTIONS,
    userPrompt: buildAnalysisPrompt(maskedText, contractType),
    jsonSchema,
  });

  const firstAttempt = tryValidate(firstResponse.rawText);

  if (firstAttempt.success && firstAttempt.data) {
    return firstAttempt.data;
  }

  const correctionResponse = await provider.generate({
    systemInstructions: SYSTEM_INSTRUCTIONS,
    userPrompt: buildCorrectionPrompt({
      maskedText,
      contractType,
      previousResponseText: firstResponse.rawText,
      validationErrorSummary:
        firstAttempt.errorSummary ?? "The response was not valid JSON.",
    }),
    jsonSchema,
  });

  const secondAttempt = tryValidate(correctionResponse.rawText);

  if (secondAttempt.success && secondAttempt.data) {
    return secondAttempt.data;
  }

  throw schemaValidationFailedError();
}

function tryValidate(rawText: string): {
  success: boolean;
  data?: ContractUnderstanding;
  errorSummary?: string;
} {
  try {
    const candidate = parseJsonResponse(rawText);
    return validateContractUnderstanding(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parsing error";
    return { success: false, errorSummary: message };
  }
}

export const __TOTAL_ANALYSIS_ATTEMPTS = MAX_ATTEMPTS;
