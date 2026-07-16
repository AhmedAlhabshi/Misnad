import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one empty/error-state pattern reused across every V2 screen (no
 * result, PDF unavailable, financial metrics unavailable, personalized
 * analysis unavailable, chat network error) instead of each section
 * hand-rolling its own centered block.
 */
export default function EmptyStateCard({
  icon: Icon,
  title,
  body,
  action,
  tone = "neutral",
  testId,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
  tone?: "neutral" | "danger";
  testId?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center", className)}
      data-testid={testId}
    >
      <div
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full",
          tone === "danger" ? "bg-v2-danger/10 text-v2-danger" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon size={20} />
      </div>
      <div className="max-w-sm">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {body && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>}
      </div>
      {action}
    </div>
  );
}
