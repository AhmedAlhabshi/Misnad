import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import { RESULTS_COPY } from "@/lib/resultsCopy";

const STAGE_ROTATE_INTERVAL_MS = 1800;

/**
 * A neutral, honestly-worded rotating status label — never claims a
 * specific source (contract/legal/financial) is being consulted, since the
 * route is decided server-side and isn't known client-side while waiting.
 * Purely cosmetic timing, not a progress percentage or real pipeline
 * signal — the request itself is a single `fetch` awaited independently.
 */
export default function ChatLoadingState({ language }: { language: AnalysisLanguage }) {
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
    <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 self-start max-w-[85%]" data-testid="chat-loading-state">
      <Loader2 size={15} className="text-indigo-400 animate-spin shrink-0" />
      <span className="text-[13px] text-muted-foreground" data-testid="chat-loading-stage-label">
        {copy.loadingStages[stageIndex]}
      </span>
    </div>
  );
}
