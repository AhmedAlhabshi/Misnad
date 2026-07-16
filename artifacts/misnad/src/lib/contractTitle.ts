import { CONTRACT_TYPE_LABELS_AR, CONTRACT_TYPE_LABELS_EN, type AnalysisLanguage, type ContractType } from "@workspace/contract-types";
import type { ContractAnalysisResult } from "@/types/analysis";
import { sanitizeDisplayText } from "@/lib/textSanitization";

/** Real, present typeDetails fields that can meaningfully identify *this* contract — never fabricated. */
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
  /** A real, present typeDetails value (e.g. a vehicle make/model/year) — may mix scripts/digits, so callers render it in its own bidi-isolated span, never concatenated into the title string. */
  descriptor: string | null;
}

/** Shared with `OverviewTab.tsx` and the report-summary builder — a single source of truth for how the contract's display title is derived, so both always agree. */
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

/** A single plain-text title (e.g. "Auto Finance — Toyota Camry 2024"), for contexts that can't render the descriptor in its own bidi-isolated span (e.g. a PDF). */
export function buildContractTitleText(analysis: ContractAnalysisResult, language: AnalysisLanguage): string {
  const parts = buildContractTitleParts(analysis, language);
  return parts.descriptor ? `${parts.typeLabel} — ${parts.descriptor}` : parts.typeLabel;
}
