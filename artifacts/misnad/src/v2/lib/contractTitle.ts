import { CONTRACT_TYPE_LABELS_AR, CONTRACT_TYPE_LABELS_EN, type AnalysisLanguage, type ContractType } from "@workspace/contract-types";
import type { ContractAnalysisResult } from "@/types/analysis";
import { sanitizeDisplayText } from "@/lib/textSanitization";

/**
 * Duplicated verbatim from V1's `OverviewTab.tsx` (never imported from
 * there, to keep V1 completely untouched) — same real, present
 * `typeDetails` fields, same logic, same output shape.
 */
const DESCRIPTOR_FIELDS: Partial<Record<ContractType, string[]>> = {
  lease: ["propertyAddress"],
  mortgage: ["propertyAddress"],
  auto_finance: ["vehicleMake", "vehicleModel", "vehicleYear"],
  insurance: ["insuranceType"],
  employment: ["jobTitle"],
  subscription: ["serviceName"],
};

export interface ContractTitleParts {
  typeLabel: string;
  /** A real, present typeDetails value — may mix scripts/digits, so callers should render it in its own bidi-isolated span, never concatenated into the title string. */
  descriptor: string | null;
}

export function buildContractTitleParts(analysis: ContractAnalysisResult, language: AnalysisLanguage): ContractTitleParts {
  const typeLabel = language === "ar" ? CONTRACT_TYPE_LABELS_AR[analysis.contractType] : CONTRACT_TYPE_LABELS_EN[analysis.contractType];
  const fields = DESCRIPTOR_FIELDS[analysis.contractType] ?? [];
  const descriptor = fields
    .map((field) => analysis.typeDetails[field])
    .filter((value): value is string | number => (typeof value === "string" && value.trim().length > 0) || typeof value === "number")
    .map((value) => sanitizeDisplayText(String(value)))
    .filter((value): value is string => value !== null)
    .join(" ");
  return { typeLabel, descriptor: descriptor || null };
}
