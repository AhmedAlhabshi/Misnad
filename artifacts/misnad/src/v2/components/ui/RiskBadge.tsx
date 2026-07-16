import type { AnalysisLanguage } from "@workspace/contract-types";
import type { RiskLevel } from "@/types/analysis";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { cn } from "@/lib/utils";

const RISK_STYLES: Record<RiskLevel, string> = {
  high: "bg-v2-danger/10 text-v2-danger border-v2-danger/25",
  medium: "bg-v2-warning/10 text-v2-warning-foreground border-v2-warning/30",
  low: "bg-v2-success/10 text-v2-success border-v2-success/25",
};

/** Never renders for a null/unrated level — matches the app-wide "never show N/A" convention. */
export default function RiskBadge({
  level,
  language,
  className,
}: {
  level: RiskLevel | null;
  language: AnalysisLanguage;
  className?: string;
}) {
  if (!level) {
    return null;
  }
  const copy = RESULTS_COPY[language].contract;
  const label = level === "high" ? copy.riskHigh : level === "medium" ? copy.riskMedium : copy.riskLow;

  return (
    <span
      data-testid={`risk-badge-${level}`}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2.5 py-0.5 text-xs font-semibold",
        RISK_STYLES[level],
        className,
      )}
    >
      {label}
    </span>
  );
}
