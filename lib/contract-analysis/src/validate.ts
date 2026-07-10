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

export function validateContractUnderstanding(
  candidate: unknown,
): ValidationResult {
  const result = contractUnderstandingSchema.safeParse(candidate);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errorSummary: summarizeZodError(result.error),
  };
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
