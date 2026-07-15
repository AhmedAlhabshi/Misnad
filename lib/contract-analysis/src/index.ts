export { analyzeContract } from "./service";
export type { AnalyzeContractOptions } from "./service";

export type { DeterministicRecoveryNote } from "./promptBuilder";

export {
  ContractAnalysisError,
  type ContractAnalysisErrorCode,
} from "./errors";

export type {
  ContractAnalysisProvider,
  ContractAnalysisProviderRequest,
  ContractAnalysisProviderResponse,
} from "./providers/types";

export { geminiContractAnalysisProvider } from "./providers/geminiProvider";

export { analyzePersonalizedFinancialImpact } from "./personalizedAnalysisService";
export type { AnalyzePersonalizedFinancialImpactOptions } from "./personalizedAnalysisService";

export {
  personalizedAnalysisRequestSchema,
  personalizedAnalysisResponseSchema,
  sanitizedClausePayloadSchema,
  financialConceptPayloadSchema,
  budgetMetricsPayloadSchema,
  insightItemSchema,
  beforeYouSignItemSchema,
  beforeYouSignTypeSchema,
} from "./personalizedAnalysisSchema";
export type {
  PersonalizedAnalysisRequest,
  PersonalizedAnalysisResponse,
  SanitizedClausePayload,
  FinancialConceptPayload,
  BudgetMetricsPayload,
  InsightItem,
  BeforeYouSignItem,
  BeforeYouSignType,
} from "./personalizedAnalysisSchema";
