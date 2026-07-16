import { useRef } from "react";
import { motion } from "framer-motion";
import { ArrowRight, FileWarning } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { getSafeFileNameDisplay } from "@/lib/safeFileName";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import type { StoredAnalysisResult } from "@/types/analysis";
import { V2_COPY } from "../copy";
import EmptyStateCard from "../components/ui/EmptyStateCard";
import OverviewSection from "../components/results/OverviewSection";
import ExecutiveSummarySection from "../components/results/ExecutiveSummarySection";
import FinancialObligationsSection from "../components/results/FinancialObligationsSection";
import ClausesSection from "../components/results/ClausesSection";
import PersonalizedInsightsSection from "../components/results/PersonalizedInsightsSection";
import ContractSection from "../components/results/ContractSection";
import AdvisorChat from "../components/chat/AdvisorChat";

type TabValue = "overview" | "executiveSummary" | "financialObligations" | "clauses" | "insights" | "chat" | "document";

const TAB_VALUES: TabValue[] = ["overview", "executiveSummary", "financialObligations", "clauses", "insights", "chat", "document"];

export default function ResultsScreen({
  onNavigate,
  analysisResult,
}: {
  onNavigate: (s: string) => void;
  analysisResult?: StoredAnalysisResult | null;
}) {
  const lang = analysisResult?.analysisLanguage ?? "ar";
  const copy = RESULTS_COPY[lang];
  const v2Copy = V2_COPY[lang];
  const isAr = lang === "ar";
  const analysis = analysisResult?.analysis ?? null;
  const triggerRefs = useRef<Partial<Record<TabValue, HTMLButtonElement | null>>>({});

  function handleTabChange(value: string) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => {
      triggerRefs.current[value as TabValue]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
  }

  if (!analysisResult || !analysis) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        dir={isAr ? "rtl" : "ltr"}
        className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6"
      >
        <EmptyStateCard
          icon={FileWarning}
          title={copy.noResult}
          action={
            <Button onClick={() => onNavigate("home")} data-testid="button-back-home-from-results">
              {copy.back}
            </Button>
          }
        />
      </motion.div>
    );
  }

  const safeFileName = getSafeFileNameDisplay(analysisResult.fileName, copy.fileNameFallback);

  const tabLabels: Record<TabValue, { full: string; short: string }> = {
    overview: v2Copy.tabs.overview,
    executiveSummary: v2Copy.tabs.executiveSummary,
    financialObligations: v2Copy.tabs.financialObligations,
    clauses: v2Copy.tabs.clauses,
    insights: v2Copy.tabs.insights,
    chat: v2Copy.tabs.chat,
    document: v2Copy.tabs.document,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      dir={isAr ? "rtl" : "ltr"}
      className="flex min-h-[100dvh] flex-col"
    >
      <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur-sm">
        <button
          onClick={() => onNavigate("home")}
          data-testid="button-back-home"
          className="flex items-center gap-1.5 rounded-md text-sm font-semibold text-foreground hover:text-primary"
        >
          <ArrowRight size={16} className={isAr ? "rotate-180" : ""} />
          <span>{v2Copy.back}</span>
        </button>
        <span dir="auto" className="max-w-[45%] truncate text-xs text-muted-foreground">
          {safeFileName}
        </span>
      </div>

      <Tabs defaultValue="overview" onValueChange={handleTabChange} className="flex flex-col">
        <TabsList className="hide-scrollbar sticky top-16 z-10 h-auto w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-none border-b border-border bg-background/95 px-6 py-0 backdrop-blur-sm">
          {TAB_VALUES.map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              data-testid={`tab-trigger-${value}`}
              ref={(el) => {
                triggerRefs.current[value] = el;
              }}
              className="shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-3 py-3 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <span className="sm:hidden">{tabLabels[value].short}</span>
              <span className="hidden sm:inline">{tabLabels[value].full}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mx-auto w-full max-w-4xl px-6 py-6">
          <TabsContent value="overview" className="mt-0">
            <OverviewSection analysis={analysis} financialMetrics={analysisResult.financialMetrics} language={lang} />
          </TabsContent>
          <TabsContent value="executiveSummary" className="mt-0">
            <ExecutiveSummarySection analysis={analysis} financialMetrics={analysisResult.financialMetrics} language={lang} />
          </TabsContent>
          <TabsContent value="financialObligations" className="mt-0">
            <FinancialObligationsSection analysis={analysis} financialMetrics={analysisResult.financialMetrics} language={lang} />
          </TabsContent>
          <TabsContent value="clauses" className="mt-0">
            <ClausesSection analysis={analysis} language={lang} />
          </TabsContent>
          <TabsContent value="insights" className="mt-0">
            <PersonalizedInsightsSection analysis={analysis} financialMetrics={analysisResult.financialMetrics} language={lang} />
          </TabsContent>
          <TabsContent value="chat" className="mt-0">
            <AdvisorChat
              language={lang}
              contractType={analysisResult.selectedContractType}
              contractRagSessionId={analysisResult.contractRagSessionId}
              analysis={analysis}
              financialMetrics={analysisResult.financialMetrics}
            />
          </TabsContent>
          <TabsContent value="document" className="mt-0">
            <ContractSection contractObjectUrl={analysisResult.contractObjectUrl} language={lang} />
          </TabsContent>
        </div>
      </Tabs>
    </motion.div>
  );
}
