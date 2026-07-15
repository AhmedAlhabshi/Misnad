import type { AnalysisLanguage } from "@workspace/contract-types";

/**
 * Renders `BudgetImpactResult.emergencyCoverageMonths` as a natural
 * sentence fragment instead of a bare number — Arabic distinguishes
 * singular ("شهر واحد"), dual ("شهرين"), and plural ("أشهر"/"شهراً")
 * month counts, so a plain `Intl.NumberFormat` count is never sufficient
 * here. Rounds to the nearest whole month for wording purposes (the
 * underlying `emergencyCoverageMonths` value itself is not rounded/altered
 * — this is presentation only).
 */
export function formatEmergencyCoverageMonths(months: number, language: AnalysisLanguage): string {
  const rounded = Math.round(months);

  if (rounded < 1) {
    return language === "ar" ? "أقل من شهر واحد" : "Less than one month";
  }

  if (language === "ar") {
    if (rounded === 1) return "حوالي شهر واحد";
    if (rounded === 2) return "حوالي شهرين";
    if (rounded >= 3 && rounded <= 10) return `حوالي ${rounded} أشهر`;
    return `حوالي ${rounded} شهراً`;
  }

  return rounded === 1 ? "About 1 month" : `About ${rounded} months`;
}
