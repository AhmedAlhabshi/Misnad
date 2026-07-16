import { useState } from "react";
import { HelpCircle, Lightbulb } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type { PersonalizedAnalysisResponse } from "@/lib/personalizedAnalysisApi";
import type { PersonalizedAnalysisStatus } from "@/hooks/usePersonalizedAnalysisSession";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import Accordion from "./shared/Accordion";

/**
 * Sections 2-4 of the Personalized Financial Analysis. Purely presentational
 * — the request that produces `data` is triggered exactly once per user
 * submission by the parent (`FinancialAnalysisTab`, via
 * `usePersonalizedAnalysisSession`), not by this component mounting. This
 * component itself owns no durable state and performs no network requests,
 * so it can safely unmount/remount as the user switches result tabs without
 * losing or re-fetching anything — the actual data lives in the parent.
 */
export default function PersonalizedAnalysisSection({
  language,
  status,
  data,
}: {
  language: AnalysisLanguage;
  status: PersonalizedAnalysisStatus;
  data: PersonalizedAnalysisResponse | null;
}) {
  const copy = RESULTS_COPY[language].financialAnalysis.personalizedAnalysis;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (status === "loading" || status === "idle") {
    return (
      <div
        dir={language === "ar" ? "rtl" : "ltr"}
        className="flex flex-col items-center justify-center gap-2 py-10 text-center"
        data-testid="personalized-analysis-loading"
      >
        <p className="text-[13px] text-muted-foreground">{copy.loading}</p>
      </div>
    );
  }

  if (status === "unavailable" || !data) {
    return (
      <div
        dir={language === "ar" ? "rtl" : "ltr"}
        className="flex flex-col items-center justify-center gap-2 py-8 text-center"
        data-testid="personalized-analysis-unavailable"
      >
        <p className="text-[13px] text-muted-foreground">{copy.unavailable}</p>
      </div>
    );
  }

  const sections: { key: "personalImpact" | "thingsToWatch"; title: string; items: PersonalizedAnalysisResponse["personalImpact"] }[] = [
    { key: "personalImpact", title: copy.personalImpactTitle, items: data.personalImpact },
    { key: "thingsToWatch", title: copy.thingsToWatchTitle, items: data.thingsToWatch },
  ];

  return (
    <div dir={language === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-3" data-testid="personalized-analysis-section">
      {sections.map(({ key, title, items }) => {
        if (items.length === 0) {
          return null;
        }
        return (
          <Accordion key={key} title={title} expanded={expanded.has(key)} onToggle={() => toggle(key)} testId={`personalized-analysis-${key}`}>
            {items.map((item, index) => (
              <div key={index} className="border-b border-white/5 last:border-0 pb-2 last:pb-0">
                <p className="text-[13px] text-white font-semibold">{item.title}</p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{item.explanation}</p>
              </div>
            ))}
          </Accordion>
        );
      })}

      {data.beforeYouSign.length > 0 && (
        <Accordion
          title={copy.beforeYouSignTitle}
          expanded={expanded.has("beforeYouSign")}
          onToggle={() => toggle("beforeYouSign")}
          testId="personalized-analysis-beforeYouSign"
        >
          {data.beforeYouSign.map((item, index) => {
            const isQuestion = item.type === "question";
            const Icon = isQuestion ? HelpCircle : Lightbulb;
            const badgeLabel = isQuestion ? copy.questionLabel : copy.adviceLabel;
            return (
              <div key={index} className="border-b border-white/5 last:border-0 pb-2 last:pb-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={13} className={isQuestion ? "text-indigo-400" : "text-emerald-400"} />
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${isQuestion ? "text-indigo-400" : "text-emerald-400"}`}>
                    {badgeLabel}
                  </span>
                </div>
                <p className="text-[13px] text-white font-semibold">{item.title}</p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{item.text}</p>
              </div>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
