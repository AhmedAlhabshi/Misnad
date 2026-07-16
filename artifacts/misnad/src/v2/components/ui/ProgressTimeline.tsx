import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimelineStage {
  label: string;
  status: "completed" | "active" | "pending" | "failed";
}

/** A compact stepped checklist — the calm "Stripe processing" alternative to V1's tall stack of colored pill rows. */
export default function ProgressTimeline({ stages }: { stages: TimelineStage[] }) {
  return (
    <ol className="flex flex-col gap-2.5" data-testid="progress-timeline">
      {stages.map((stage, index) => (
        <li
          key={index}
          className="flex items-center gap-2.5 text-sm"
          data-testid={`progress-timeline-stage-${index}`}
          data-status={stage.status}
        >
          {stage.status === "completed" ? (
            <CheckCircle2 size={16} className="shrink-0 text-v2-success" />
          ) : stage.status === "active" ? (
            <Loader2 size={16} className="shrink-0 animate-spin text-primary" />
          ) : stage.status === "failed" ? (
            <XCircle size={16} className="shrink-0 text-v2-danger" />
          ) : (
            <span className="h-4 w-4 shrink-0 rounded-full border-2 border-border" />
          )}
          <span
            className={cn(
              stage.status === "pending" ? "text-muted-foreground" : "text-foreground",
              stage.status === "active" && "font-semibold",
              stage.status === "failed" && "text-v2-danger font-semibold",
            )}
          >
            {stage.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
