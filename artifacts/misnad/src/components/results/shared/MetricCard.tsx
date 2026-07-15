/**
 * A compact "labeled value" card reused across Overview, Contract Finances,
 * and Budget Impact. Unlike the retired `FinancialMetricCard`, this has no
 * "unavailable" branch at all — callers always filter to available metrics
 * *before* mapping over them (see `financialPresentation.ts`), so an
 * unavailable value is simply never passed in here, per the strict
 * unavailable-data rule (never render "N/A" / "غير متاح" / a bare reason).
 */
export interface MetricCardProps {
  testId?: string;
  label: string;
  value: string;
  /** At most one short secondary line (e.g. a duration's day-equivalent) — never a reason/status explanation. */
  secondary?: string | null;
}

export default function MetricCard({ testId, label, value, secondary }: MetricCardProps) {
  return (
    <div data-testid={testId} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-1 min-w-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-bold text-white break-words">{value}</span>
      {secondary && <span className="text-[11px] text-muted-foreground">{secondary}</span>}
    </div>
  );
}
