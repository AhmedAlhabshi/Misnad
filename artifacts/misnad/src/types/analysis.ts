import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";

export type RiskLevel = "low" | "medium" | "high";

export interface Party {
  role: string;
  name: string | null;
  identifier: string | null;
  notes: string | null;
}

export interface FinancialObligation {
  description: string;
  amount: number | null;
  currency: string | null;
  frequency: string | null;
  dueDate: string | null;
}

export interface ContractDateItem {
  label: string;
  date: string | null;
  notes: string | null;
}

export interface Penalty {
  description: string;
  amount: number | null;
  currency: string | null;
  condition: string | null;
}

export interface Fee {
  description: string;
  amount: number | null;
  currency: string | null;
  isRecurring: boolean | null;
}

export interface ImportantClause {
  title: string;
  summary: string;
  riskLevel: RiskLevel | null;
  /**
   * A verbatim excerpt from the masked contract text supporting this
   * clause, exactly as returned by the backend — never translated or
   * altered in the UI. Null when no reliable excerpt exists.
   */
  evidence: string | null;
}

export interface ExtractedNumberItem {
  label: string;
  value: number;
  unit: string | null;
}

export interface MissingInformationItem {
  /** Raw internal field path (e.g. "typeDetails.vehicleMake") — never shown to the user directly. */
  field: string;
  reason: string | null;
}

/**
 * Type-specific details. Deliberately loosely typed (rather than a full
 * discriminated union mirroring every contract-schema variant) since the
 * frontend only ever reads individual named fields with runtime type
 * guards before rendering — see lib/fieldLabels.ts and ResultsScreen.tsx.
 */
export type TypeDetails = Record<string, unknown> & { contractType: ContractType };

export interface ContractAnalysisResult {
  contractType: ContractType;
  parties: Party[];
  financialObligations: FinancialObligation[];
  dates: ContractDateItem[];
  penalties: Penalty[];
  fees: Fee[];
  importantClauses: ImportantClause[];
  extractedNumbers: ExtractedNumberItem[];
  missingInformation: MissingInformationItem[];
  extractionNotes: string | null;
  typeDetails: TypeDetails;
}

/** Shape of the /api/analyze-contract JSON response that the frontend relies on. */
export interface AnalyzeContractApiResponse {
  success: boolean;
  message?: string;
  fileName?: string;
  piiStatistics?: Record<string, unknown>;
  analysis?: ContractAnalysisResult | null;
  analysisError?: string;
}

export interface PendingUpload {
  file: File;
  contractType: ContractType;
  analysisLanguage: AnalysisLanguage;
}

export interface StoredAnalysisResult {
  analysis: ContractAnalysisResult | null;
  selectedContractType: ContractType;
  analysisLanguage: AnalysisLanguage;
  fileName: string;
  piiStatistics: Record<string, unknown>;
}
