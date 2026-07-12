export type ContractType =
  | "auto_finance"
  | "personal_finance"
  | "mortgage"
  | "credit_card"
  | "lease"
  | "insurance"
  | "employment"
  | "subscription"
  | "other";

export interface ContractTypeDefinition {
  value: ContractType;
  labelAr: string;
  labelEn: string;
}

export const CONTRACT_TYPES: readonly ContractTypeDefinition[] = [
  { value: "auto_finance", labelAr: "تمويل سيارة", labelEn: "Auto Finance" },
  { value: "personal_finance", labelAr: "تمويل شخصي", labelEn: "Personal Finance" },
  { value: "mortgage", labelAr: "تمويل عقاري", labelEn: "Mortgage" },
  { value: "credit_card", labelAr: "بطاقة ائتمانية", labelEn: "Credit Card" },
  { value: "lease", labelAr: "عقد إيجار", labelEn: "Lease" },
  { value: "insurance", labelAr: "تأمين", labelEn: "Insurance" },
  { value: "employment", labelAr: "عقد عمل", labelEn: "Employment Contract" },
  { value: "subscription", labelAr: "اشتراك", labelEn: "Subscription" },
  { value: "other", labelAr: "أخرى", labelEn: "Other" },
];

export const CONTRACT_TYPE_VALUES: readonly ContractType[] = CONTRACT_TYPES.map(
  (t) => t.value,
);

export const CONTRACT_TYPE_LABELS_AR: Record<ContractType, string> =
  Object.fromEntries(CONTRACT_TYPES.map((t) => [t.value, t.labelAr])) as Record<
    ContractType,
    string
  >;

export const CONTRACT_TYPE_LABELS_EN: Record<ContractType, string> =
  Object.fromEntries(CONTRACT_TYPES.map((t) => [t.value, t.labelEn])) as Record<
    ContractType,
    string
  >;

export function isContractType(value: unknown): value is ContractType {
  return (
    typeof value === "string" &&
    CONTRACT_TYPE_VALUES.includes(value as ContractType)
  );
}

export type AnalysisLanguage = "ar" | "en";

export const ANALYSIS_LANGUAGE_VALUES: readonly AnalysisLanguage[] = ["ar", "en"];

/** Each language's own display name, shown as-is regardless of current UI language. */
export const ANALYSIS_LANGUAGE_DISPLAY_NAMES: Record<AnalysisLanguage, string> = {
  ar: "العربية",
  en: "English",
};

export function isAnalysisLanguage(value: unknown): value is AnalysisLanguage {
  return typeof value === "string" && ANALYSIS_LANGUAGE_VALUES.includes(value as AnalysisLanguage);
}
