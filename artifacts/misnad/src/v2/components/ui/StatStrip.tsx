import type { ReactNode } from "react";

export interface StatItem {
  key: string;
  label: string;
  value: ReactNode;
  secondary?: string | null;
}

/** A compact row of headline figures — used at the top of Contract Overview so the user sees risk/duration/monthly commitment/total cost at a glance. Only ever renders items the caller has already resolved to a real value — never an "N/A" placeholder. */
export default function StatStrip({ items }: { items: StatItem[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="stat-strip">
      {items.map((item) => (
        <div key={item.key} className="rounded-lg border border-border bg-card p-3.5" data-testid={`stat-item-${item.key}`}>
          <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
          <div className="mt-1 text-base font-bold text-foreground">{item.value}</div>
          {item.secondary && <p className="mt-0.5 text-xs text-muted-foreground">{item.secondary}</p>}
        </div>
      ))}
    </div>
  );
}
