import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import { RESULTS_COPY } from "@/lib/resultsCopy";

const STAGE_ROTATE_INTERVAL_MS = 1800;

/** Neutral rotating status label — never claims a specific source is being consulted, since the route is decided server-side. */
export default function AdvisorLoadingState({ language }: { language: AnalysisLanguage }) {
  const copy = RESULTS_COPY[language].chat;
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    setStageIndex(0);
    const interval = setInterval(() => {
      setStageIndex((index) => (index + 1) % copy.loadingStages.length);
    }, STAGE_ROTATE_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  return (
    <div className="flex max-w-[85%] items-center gap-2 self-start rounded-md border border-border bg-card px-4 py-3" data-testid="chat-loading-state">
      <Loader2 size={15} className="shrink-0 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground" data-testid="chat-loading-stage-label">
        {copy.loadingStages[stageIndex]}
      </span>
    </div>
  );
}
