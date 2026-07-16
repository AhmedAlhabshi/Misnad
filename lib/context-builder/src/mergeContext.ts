import type { ChatRoute, ChatSourceKind } from "@workspace/chat-router";
import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import { groundedContextSchema, type AnalysisFactItem, type ContractEvidenceItem, type FinancialFactItem, type GroundedContext, type LegalEvidenceItem } from "./schema";

export interface MergeContextInput {
  route: ChatRoute;
  question: string;
  language: AnalysisLanguage;
  contractType: ContractType;
  sourcesUsed: ChatSourceKind[];
  contractEvidence: ContractEvidenceItem[];
  legalEvidence: LegalEvidenceItem[];
  financialFacts: FinancialFactItem[];
  analysisFacts: AnalysisFactItem[];
  tokenEstimate: number;
  warnings: string[];
}

/**
 * The single assembly point for the final `GroundedContext` object —
 * everything upstream (retrievers, collectors, ranking, budget) produces
 * plain arrays; this is the only place they're combined into the validated
 * output shape. Always runs the result through `groundedContextSchema`, so
 * a malformed context (e.g. a NaN token estimate) throws here rather than
 * reaching a caller silently.
 */
export function mergeContext(input: MergeContextInput): GroundedContext {
  return groundedContextSchema.parse(input);
}
