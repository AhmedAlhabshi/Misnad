import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, CheckCircle2, Loader2, Clock, XCircle } from "lucide-react";
import {
  ANALYSIS_PROGRESS_STAGES,
  MAX_AUTO_COMPLETED_STAGES,
  OCR_PROGRESS_STAGES,
  progressStageLabel,
  type ProgressStageStatus,
} from "@/lib/analysisProgress";
import type {
  AnalyzeContractApiResponse,
  PendingUpload,
  StoredAnalysisResult,
} from "@/types/analysis";

const STAGE_ADVANCE_INTERVAL_MS = 900;

const COPY = {
  ar: {
    heading: "جاري تحليل عقدك...",
    failedHeading: "تعذّر إكمال التحليل",
    backHome: "العودة للرئيسية",
    fact: "هل تعلم؟ 68% من الناس لا يقرؤون عقودهم كاملاً قبل التوقيع.",
    malformedResponse: "استجابة غير متوقعة من الخادم. حاول مرة أخرى.",
    genericFailure: "حدث خطأ أثناء تحليل العقد.",
  },
  en: {
    heading: "Analyzing your contract...",
    failedHeading: "Couldn't complete the analysis",
    backHome: "Back to home",
    fact: "Did you know? 68% of people don't fully read their contracts before signing.",
    malformedResponse: "Unexpected response from the server. Please try again.",
    genericFailure: "Something went wrong while analyzing the contract.",
  },
} as const;

function isWellFormedResponse(value: unknown): value is AnalyzeContractApiResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    typeof (value as { success: unknown }).success === "boolean"
  );
}

export default function LoadingScreen({
  onNavigate,
  pendingUpload,
  onAnalysisComplete,
}: {
  onNavigate: (s: string) => void;
  pendingUpload: PendingUpload | null;
  onAnalysisComplete: (result: StoredAnalysisResult) => void;
}) {
  const [completedCount, setCompletedCount] = useState(0);
  const [ocrStageIndex, setOcrStageIndex] = useState(-1);
  const [failed, setFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingUpload) return;

    let cancelled = false;
    setCompletedCount(0);
    setOcrStageIndex(-1);
    setFailed(false);
    setErrorMessage(null);

    // The base stage sequence estimates a typical (native-text) analysis.
    // If the request is still pending once that sequence has run its
    // course, the wait has genuinely gone on long enough to plausibly mean
    // OCR is running on a scanned PDF — so, and only then, start advancing
    // through the OCR-specific stages as an honest "this is taking longer"
    // signal, never a claimed exact percentage.
    const interval = setInterval(() => {
      setCompletedCount((count) => {
        if (count < MAX_AUTO_COMPLETED_STAGES) {
          return count + 1;
        }
        setOcrStageIndex((ocrIndex) => Math.min(ocrIndex + 1, OCR_PROGRESS_STAGES.length - 1));
        return count;
      });
    }, STAGE_ADVANCE_INTERVAL_MS);

    async function run() {
      const copy = COPY[pendingUpload!.analysisLanguage];
      try {
        const formData = new FormData();
        formData.append("file", pendingUpload!.file);
        formData.append("userSelectedContractType", pendingUpload!.contractType);
        formData.append("analysisLanguage", pendingUpload!.analysisLanguage);

        const res = await fetch("/api/analyze-contract", {
          method: "POST",
          body: formData,
        });

        const body: unknown = await res.json().catch(() => null);

        if (!isWellFormedResponse(body)) {
          throw new Error(copy.malformedResponse);
        }

        if (!res.ok || !body.success) {
          throw new Error(body.message ?? copy.genericFailure);
        }

        if (cancelled) return;

        clearInterval(interval);
        setCompletedCount(ANALYSIS_PROGRESS_STAGES.length);

        // A same-session-only object URL for the Contract tab's PDF viewer —
        // never persisted, revoked in App.tsx when this result is replaced by
        // a new upload. Creation failure (should not happen for a real File)
        // degrades to null rather than blocking the rest of the result.
        let contractObjectUrl: string | null = null;
        try {
          contractObjectUrl = URL.createObjectURL(pendingUpload!.file);
        } catch {
          contractObjectUrl = null;
        }

        const result: StoredAnalysisResult = {
          analysis: body.analysis ?? null,
          selectedContractType: pendingUpload!.contractType,
          analysisLanguage: pendingUpload!.analysisLanguage,
          fileName: body.fileName ?? pendingUpload!.file.name,
          piiStatistics: body.piiStatistics ?? {},
          financialMetrics: body.financialMetrics ?? null,
          financialMetricsError: body.financialMetricsError ?? null,
          documentExtraction: body.documentExtraction ?? null,
          contractObjectUrl,
        };

        onAnalysisComplete(result);
        onNavigate("results");
      } catch (err) {
        if (cancelled) return;
        clearInterval(interval);
        setFailed(true);
        setErrorMessage(err instanceof Error ? err.message : copy.genericFailure);
      }
    }

    run();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pendingUpload]);

  if (!pendingUpload) {
    return null;
  }

  const copy = COPY[pendingUpload.analysisLanguage];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="p-6 flex flex-col items-center justify-center min-h-screen gap-10"
    >
      <div className="relative w-[140px] h-[140px] flex items-center justify-center">
        <div className="w-16 h-16 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center text-indigo-400">
          {failed ? <XCircle size={32} className="text-red-500" /> : <FileText size={32} />}
        </div>
      </div>

      <h2 className="text-xl font-bold text-white tracking-wide" data-testid="text-loading-heading">
        {failed ? copy.failedHeading : copy.heading}
      </h2>

      <div className="w-full flex flex-col gap-3">
        {ANALYSIS_PROGRESS_STAGES.map((stage, idx) => {
          // Once the OCR-specific stages have started showing, the base
          // sequence's final stage reads as completed (the wait has moved
          // on to OCR-specific work) rather than perpetually "active".
          const isCompleted = idx < completedCount || (idx === completedCount && ocrStageIndex >= 0);
          const isCurrent = idx === completedCount && ocrStageIndex < 0;
          const isFailedStage = failed && isCurrent;
          const status: ProgressStageStatus = isCompleted
            ? "completed"
            : isFailedStage
              ? "failed"
              : isCurrent
                ? "active"
                : "pending";

          return (
            <div
              key={idx}
              data-testid={`progress-stage-${idx}`}
              data-status={status}
              className={`h-[52px] rounded-xl flex items-center px-4 gap-4 transition-all duration-300 ${
                status === "active" ? "bg-indigo-500/10 border border-indigo-500/20" : "bg-white/5 border border-white/5"
              } ${status === "completed" ? "bg-emerald-500/10 border-emerald-500/20" : ""} ${
                status === "failed" ? "bg-red-500/10 border-red-500/20" : ""
              }`}
            >
              <div className="shrink-0 w-6 flex justify-center">
                {status === "completed" ? (
                  <CheckCircle2 size={20} className="text-emerald-500" />
                ) : status === "failed" ? (
                  <XCircle size={20} className="text-red-500" />
                ) : status === "active" ? (
                  <Loader2 size={20} className="text-indigo-400 animate-spin" />
                ) : (
                  <Clock size={20} className="text-muted-foreground/50" />
                )}
              </div>
              <span
                className={`font-semibold text-[15px] ${
                  status === "completed"
                    ? "text-emerald-500"
                    : status === "failed"
                      ? "text-red-400"
                      : status === "active"
                        ? "text-indigo-400"
                        : "text-muted-foreground"
                }`}
              >
                {progressStageLabel(stage, pendingUpload.analysisLanguage)}
              </span>
            </div>
          );
        })}
        {ocrStageIndex >= 0 &&
          OCR_PROGRESS_STAGES.slice(0, ocrStageIndex + 1).map((stage, idx) => {
            const isCompleted = idx < ocrStageIndex;
            const isCurrent = idx === ocrStageIndex;
            const isFailedStage = failed && isCurrent;
            const status: ProgressStageStatus = isCompleted
              ? "completed"
              : isFailedStage
                ? "failed"
                : isCurrent
                  ? "active"
                  : "pending";

            return (
              <div
                key={`ocr-${idx}`}
                data-testid={`progress-stage-ocr-${idx}`}
                data-status={status}
                className={`h-[52px] rounded-xl flex items-center px-4 gap-4 transition-all duration-300 ${
                  status === "active" ? "bg-indigo-500/10 border border-indigo-500/20" : "bg-white/5 border border-white/5"
                } ${status === "completed" ? "bg-emerald-500/10 border-emerald-500/20" : ""} ${
                  status === "failed" ? "bg-red-500/10 border-red-500/20" : ""
                }`}
              >
                <div className="shrink-0 w-6 flex justify-center">
                  {status === "completed" ? (
                    <CheckCircle2 size={20} className="text-emerald-500" />
                  ) : status === "failed" ? (
                    <XCircle size={20} className="text-red-500" />
                  ) : status === "active" ? (
                    <Loader2 size={20} className="text-indigo-400 animate-spin" />
                  ) : (
                    <Clock size={20} className="text-muted-foreground/50" />
                  )}
                </div>
                <span
                  className={`font-semibold text-[15px] ${
                    status === "completed"
                      ? "text-emerald-500"
                      : status === "failed"
                        ? "text-red-400"
                        : status === "active"
                          ? "text-indigo-400"
                          : "text-muted-foreground"
                  }`}
                >
                  {progressStageLabel(stage, pendingUpload.analysisLanguage)}
                </span>
              </div>
            );
          })}
      </div>

      {failed ? (
        <div className="w-full flex flex-col gap-3" data-testid="loading-error">
          <p className="text-center text-sm text-red-400">{errorMessage}</p>
          <button
            onClick={() => onNavigate("home")}
            data-testid="button-back-home"
            className="w-full h-11 rounded-full bg-white/5 border border-white/10 text-white text-sm font-bold hover:bg-white/10 transition-colors"
          >
            {copy.backHome}
          </button>
        </div>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 w-full">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-500">
            💡
          </div>
          <p className="text-[13px] text-amber-200/90 leading-relaxed font-medium">{copy.fact}</p>
        </div>
      )}
    </motion.div>
  );
}
