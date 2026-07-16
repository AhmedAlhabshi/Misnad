import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";
import type { FinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult } from "@/types/analysis";
import type { PersonalizedAnalysisSessionState } from "@/hooks/usePersonalizedAnalysisSession";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildReportSummaryData, canIncludePersonalizedInReport } from "@/lib/reportSummary";
import { buildReportFileName, generateReportPdfBlob } from "@/lib/pdf/generateReportPdf";
import { REPORT_SUMMARY_COPY } from "@/lib/reportSummaryCopy";

type ReportOption = "contractOnly" | "withPersonalized";

/**
 * Downloads `blob` under `fileName` using a transient anchor element — the
 * object URL is revoked immediately after the click so nothing about the
 * generated PDF (which contains the user's financial figures for Option B)
 * lingers in memory or in any browser history beyond the download itself.
 */
function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function ReportDownloadDialog({
  open,
  onOpenChange,
  language,
  contractType,
  analysis,
  financialMetrics,
  personalizedSessionState,
  onNavigateToPersonalizedAnalysis,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: AnalysisLanguage;
  contractType: ContractType;
  analysis: ContractAnalysisResult;
  financialMetrics: FinancialMetrics | null;
  personalizedSessionState: PersonalizedAnalysisSessionState;
  onNavigateToPersonalizedAnalysis: () => void;
}) {
  const copy = REPORT_SUMMARY_COPY[language].dialog;
  const isAr = language === "ar";
  const [selectedOption, setSelectedOption] = useState<ReportOption>("contractOnly");
  const [isGenerating, setIsGenerating] = useState(false);

  const personalizedAvailable = canIncludePersonalizedInReport(personalizedSessionState);

  function handleGoToPersonalizedAnalysis() {
    onOpenChange(false);
    onNavigateToPersonalizedAnalysis();
  }

  async function handleGenerate() {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const data = buildReportSummaryData({
        language,
        analysis,
        financialMetrics,
        includePersonalized: selectedOption === "withPersonalized",
        personalizedSession: personalizedSessionState,
      });
      const blob = await generateReportPdfBlob(data);
      triggerBlobDownload(blob, buildReportFileName(data));
      onOpenChange(false);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        data-testid="report-download-dialog"
        className="bg-[#0D1117] border border-white/10 text-white max-w-[420px]"
      >
        <DialogHeader>
          <DialogTitle className="text-white text-start">{copy.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-2">
          <button
            type="button"
            onClick={() => setSelectedOption("contractOnly")}
            data-testid="report-option-contract-only"
            aria-pressed={selectedOption === "contractOnly"}
            className={`w-full text-start rounded-2xl border p-4 transition-colors ${
              selectedOption === "contractOnly" ? "border-indigo-400 bg-indigo-500/10" : "border-white/10 bg-white/5"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-semibold text-white">{copy.optionATitle}</span>
              {selectedOption === "contractOnly" && <CheckCircle2 size={18} className="text-indigo-400 shrink-0" />}
            </div>
            <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{copy.optionADescription}</p>
          </button>

          <button
            type="button"
            onClick={() => personalizedAvailable && setSelectedOption("withPersonalized")}
            disabled={!personalizedAvailable}
            data-testid="report-option-with-personalized"
            aria-pressed={selectedOption === "withPersonalized"}
            className={`w-full text-start rounded-2xl border p-4 transition-colors disabled:opacity-50 disabled:pointer-events-none ${
              selectedOption === "withPersonalized" ? "border-indigo-400 bg-indigo-500/10" : "border-white/10 bg-white/5"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-semibold text-white">{copy.optionBTitle}</span>
              {selectedOption === "withPersonalized" && <CheckCircle2 size={18} className="text-indigo-400 shrink-0" />}
            </div>
            <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{copy.optionBDescription}</p>
          </button>

          {!personalizedAvailable && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3" data-testid="report-option-b-unavailable-notice">
              <p className="text-[12px] text-amber-300 leading-relaxed">{copy.optionBUnavailableMessage}</p>
              <button
                type="button"
                onClick={handleGoToPersonalizedAnalysis}
                data-testid="button-go-to-personalized-analysis"
                className="mt-2 text-[12px] font-semibold text-indigo-300 underline underline-offset-2"
              >
                {copy.goToPersonalizedAnalysis}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            data-testid="button-generate-report"
            className="mt-2 h-12 rounded-full bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] text-white font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {isGenerating && <Loader2 size={16} className="animate-spin" />}
            <span>{isGenerating ? copy.generating : copy.generate}</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
