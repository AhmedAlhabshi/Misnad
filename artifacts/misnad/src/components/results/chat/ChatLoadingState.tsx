import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import { RESULTS_COPY } from "@/lib/resultsCopy";

const STAGE_ADVANCE_INTERVAL_MS = 1800;

/**
 * A neutral, honestly-worded, strictly monotonic status label for a single
 * contract-chat request. Never claims a specific source (contract/legal/
 * financial) is being consulted, since the route is decided server-side and
 * isn't known client-side while waiting — and never reveals which AI
 * provider is in use, an API key, a retry, key rotation, or a provider
 * fallback. Purely cosmetic timing over ONE continuous request; the
 * request itself is a single `fetch` awaited independently by the parent.
 *
 * `stageIndex` only ever advances forward, capped at one past the last
 * stage — it never wraps back to stage 0 via modulo (a previous version
 * did `(index + 1) % loadingStages.length`, which visibly "restarted" the
 * sequence and repeated earlier messages whenever the backend took longer
 * than the fixed stage sequence, e.g. while it was rotating Gemini keys,
 * retrying, or falling back to OpenRouter). Once every stage has been
 * shown and the real answer still hasn't arrived, the label switches to
 * `copy.extendedWaitMessage` and stays there for the rest of the wait —
 * this can only ever hold or advance, never regress to an earlier stage.
 */
export default function ChatLoadingState({ language }: { language: AnalysisLanguage }) {
  const copy = RESULTS_COPY[language].chat;
  const lastStageIndex = copy.loadingStages.length - 1;
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    setStageIndex(0);
    const interval = setInterval(() => {
      setStageIndex((index) => Math.min(index + 1, lastStageIndex + 1));
    }, STAGE_ADVANCE_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const label = stageIndex > lastStageIndex ? copy.extendedWaitMessage : copy.loadingStages[stageIndex];

  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 self-start max-w-[85%]" data-testid="chat-loading-state">
      <Loader2 size={15} className="text-indigo-400 animate-spin shrink-0" />
      <span className="text-[13px] text-muted-foreground" data-testid="chat-loading-stage-label">
        {label}
      </span>
    </div>
  );
}
