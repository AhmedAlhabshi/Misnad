import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Download, FileWarning } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { REPORT_SUMMARY_COPY } from "@/lib/reportSummaryCopy";
import { getSafeFileNameDisplay } from "@/lib/safeFileName";
import type { StoredAnalysisResult } from "@/types/analysis";
import { usePersonalizedAnalysisSession } from "@/hooks/usePersonalizedAnalysisSession";
import OverviewTab from "@/components/results/OverviewTab";
import ContractFinancesTab from "@/components/results/ContractFinancesTab";
import FinancialAnalysisTab from "@/components/results/FinancialAnalysisTab";
import ContractTab from "@/components/results/ContractTab";
import ContractChat from "@/components/results/chat/ContractChat";
import ReportDownloadDialog from "@/components/results/ReportDownloadDialog";

type TabValue = "overview" | "finances" | "financialAnalysis" | "contract" | "chat";

const TAB_VALUES: TabValue[] = ["overview", "finances", "financialAnalysis", "contract", "chat"];

const TAB_TRIGGER_CLASS =
  "shrink-0 h-9 px-4 rounded-full bg-white/5 border border-white/10 text-white/70 data-[state=active]:bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] data-[state=active]:text-white data-[state=active]:border-transparent data-[state=active]:shadow-none";

export default function ResultsScreen({
  onNavigate,
  analysisResult,
}: {
  onNavigate: (s: string) => void;
  analysisResult?: StoredAnalysisResult | null;
}) {
  const lang = analysisResult?.analysisLanguage ?? "ar";
  const copy = RESULTS_COPY[lang];
  const isAr = lang === "ar";
  const analysis = analysisResult?.analysis ?? null;
  const triggerRefs = useRef<Partial<Record<TabValue, HTMLButtonElement | null>>>({});

  // Owned here — the nearest parent that stays mounted while the user
  // switches between result tabs — so the Personalized Analysis form and
  // its AI result survive tab navigation instead of being destroyed by
  // Radix's TabsContent unmounting inactive panels (see
  // usePersonalizedAnalysisSession's doc comment for the full rationale).
  // Keyed on `analysisResult` itself: a new analysis produces a new
  // `analysisResult` object, which resets this state to a fresh session.
  const personalizedAnalysisSession = usePersonalizedAnalysisSession(analysisResult);
  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const reportCopy = REPORT_SUMMARY_COPY[lang];

  function handleTabChange(value: string) {
    setActiveTab(value as TabValue);
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
        className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 text-center"
      >
        <FileWarning size={40} className="text-muted-foreground" />
        <p className="text-white/80">{copy.noResult}</p>
        <button
          onClick={() => onNavigate("home")}
          data-testid="button-back-home-from-results"
          className="h-11 px-6 rounded-full bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] text-white font-bold"
        >
          {copy.back}
        </button>
      </motion.div>
    );
  }

  const safeFileName = getSafeFileNameDisplay(analysisResult.fileName, copy.fileNameFallback);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      dir={isAr ? "rtl" : "ltr"}
      className="flex flex-col min-h-screen relative"
    >
      <div className="h-16 px-6 flex justify-between items-center bg-[#0D1117]/80 backdrop-blur-md sticky top-0 z-20 border-b border-white/5">
        <button
          onClick={() => onNavigate("home")}
          data-testid="button-back-home"
          className="h-8 px-3 rounded-full bg-white/5 border border-white/10 flex items-center gap-1 text-sm font-semibold text-white shrink-0"
        >
          <ChevronRight size={16} className={isAr ? "" : "rotate-180"} />
          <span>{copy.back}</span>
        </button>
        <span dir="auto" className="text-xs text-muted-foreground truncate max-w-[35%]">
          {safeFileName}
        </span>
        <button
          onClick={() => setIsReportDialogOpen(true)}
          data-testid="button-open-report-dialog"
          title={reportCopy.downloadButton}
          aria-label={reportCopy.downloadButton}
          className="h-8 w-8 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white"
        >
          <Download size={14} />
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col">
        <TabsList className="hide-scrollbar flex w-full max-w-full h-auto justify-start bg-transparent p-0 gap-2 px-6 pt-4 overflow-x-auto overflow-y-hidden flex-nowrap sticky top-16 z-10 scroll-mt-16 bg-[#0D1117]/80 backdrop-blur-md pb-3 border-b border-white/5 rounded-none">
          {TAB_VALUES.map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              data-testid={`tab-trigger-${value}`}
              ref={(el) => {
                triggerRefs.current[value] = el;
              }}
              className={TAB_TRIGGER_CLASS}
            >
              <span className="sm:hidden">{copy.tabs[value].short}</span>
              <span className="hidden sm:inline">{copy.tabs[value].full}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-0 px-6 pt-5 pb-10 scroll-mt-32">
          <OverviewTab analysis={analysis} language={lang} />
        </TabsContent>
        <TabsContent value="finances" className="mt-0 px-6 pt-5 pb-10 scroll-mt-32">
          <ContractFinancesTab analysis={analysis} financialMetrics={analysisResult.financialMetrics} language={lang} />
        </TabsContent>
        <TabsContent value="financialAnalysis" className="mt-0 px-6 pt-5 pb-10 scroll-mt-32">
          <FinancialAnalysisTab
            analysis={analysis}
            financialMetrics={analysisResult.financialMetrics}
            language={lang}
            session={personalizedAnalysisSession}
          />
        </TabsContent>
        <TabsContent value="contract" className="mt-0 px-6 pt-5 pb-10 scroll-mt-32">
          <ContractTab contractObjectUrl={analysisResult.contractObjectUrl} language={lang} />
        </TabsContent>
        <TabsContent value="chat" className="mt-0 px-6 pt-5 pb-10 scroll-mt-32">
          <ContractChat
            language={lang}
            contractType={analysisResult.selectedContractType}
            contractRagSessionId={analysisResult.contractRagSessionId}
            analysis={analysis}
            financialMetrics={analysisResult.financialMetrics}
          />
        </TabsContent>
      </Tabs>

      <ReportDownloadDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        language={lang}
        contractType={analysisResult.selectedContractType}
        analysis={analysis}
        financialMetrics={analysisResult.financialMetrics}
        personalizedSessionState={personalizedAnalysisSession.state}
        onNavigateToPersonalizedAnalysis={() => setActiveTab("financialAnalysis")}
      />
    </motion.div>
  );
}
