import { z } from "zod/v4";
import {
  contractUnderstandingSchema,
  type ContractUnderstanding,
} from "@workspace/contract-schema";
import { jsonParseFailedError, noUsableResponseError } from "./errors";

export function parseJsonResponse(rawText: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw noUsableResponseError();
  }

  const withoutCodeFences = stripCodeFences(trimmed);

  try {
    return JSON.parse(withoutCodeFences);
  } catch {
    throw jsonParseFailedError();
  }
}

function stripCodeFences(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fencedMatch ? fencedMatch[1] : text;
}

export interface ValidationResult {
  success: boolean;
  data?: ContractUnderstanding;
  errorSummary?: string;
}

/**
 * Validates the model's candidate output against the shared Zod schema,
 * then enforces one additional integrity rule the schema itself cannot
 * express: every non-null `importantClauses[].evidence` must be an exact
 * verbatim substring of `maskedText` (not translated, paraphrased, or
 * fabricated). A failure here is reported the same way a Zod failure is —
 * `success: false` with an `errorSummary` — so it flows through the exact
 * same existing correction/retry attempt as any other validation failure.
 */
export function validateContractUnderstanding(
  candidate: unknown,
  maskedText: string,
): ValidationResult {
  const result = contractUnderstandingSchema.safeParse(candidate);

  if (!result.success) {
    return {
      success: false,
      errorSummary: summarizeZodError(result.error),
    };
  }

  const evidenceErrors = findEvidenceIntegrityErrors(result.data, maskedText);
  if (evidenceErrors.length > 0) {
    return {
      success: false,
      errorSummary: evidenceErrors.join("\n"),
    };
  }

  return { success: true, data: result.data };
}

function findEvidenceIntegrityErrors(
  data: ContractUnderstanding,
  maskedText: string,
): string[] {
  const errors: string[] = [];

  data.importantClauses.forEach((clause, index) => {
    if (clause.evidence === null) {
      return;
    }

    if (!maskedText.includes(clause.evidence)) {
      errors.push(
        `- importantClauses.${index}.evidence: must be an exact verbatim substring of the masked contract text — it was not found (do not translate, paraphrase, or fabricate evidence; use null if no reliable excerpt exists).`,
      );
    }
  });

  return errors;
}

const MAX_ISSUES_IN_SUMMARY = 10;

function summarizeZodError(error: z.ZodError): string {
  const issues = error.issues.slice(0, MAX_ISSUES_IN_SUMMARY).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `- ${path}: ${issue.message}`;
  });

  const suffix =
    error.issues.length > MAX_ISSUES_IN_SUMMARY
      ? `\n...and ${error.issues.length - MAX_ISSUES_IN_SUMMARY} more issue(s).`
      : "";

  return `${issues.join("\n")}${suffix}`;
}
