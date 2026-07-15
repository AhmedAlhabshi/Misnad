import type { RiskLevel } from "@/types/analysis";

/** Lower rank sorts first: high risk before medium before low before unrated. Used by Overview's clause accordion. */
export function riskRank(level: RiskLevel | null): number {
  if (level === "high") return 0;
  if (level === "medium") return 1;
  if (level === "low") return 2;
  return 3;
}
