import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileSearch, XCircle } from "lucide-react";
import {
  ANALYSIS_PROGRESS_STAGES,
  MAX_AUTO_COMPLETED_STAGES,
  OCR_PROGRESS_STAGES,
  progressStageLabel,
} from "@/lib/analysisProgress";
import type { AnalyzeContractApiResponse, PendingUpload, StoredAnalysisResult } from "@/types/analysis";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import ProgressTimeline, { type TimelineStage } from "../components/ui/ProgressTimeline";

const STAGE_ADVANCE_INTERVAL_MS = 900;

const COPY = {
  ar: {
    heading: "جارٍ تحليل عقدك",
    subheading: "عادةً ما تستغرق هذه العملية أقل من دقيقة.",
    failedHeading: "تعذّر إكمال التحليل",
    backHome: "العودة للرئيسية",
    malformedResponse: "استجابة غير متوقعة من الخادم. حاول مرة أخرى.",
    genericFailure: "حدث خطأ أثناء تحليل العقد.",
  },
  en: {
    heading: "Analyzing your contract",
    subheading: "This usually takes under a minute.",
    failedHeading: "Couldn't complete the analysis",
    backHome: "Back to home",
    malformedResponse: "Unexpected response from the server. Please try again.",
    genericFailure: "Something went wrong while analyzing the contract.",
  },
} as const;

function isWellFormedResponse(value: unknown): value is AnalyzeContractApiResponse {
  return typeof value === "object" && value !== null && "success" in value && typeof (value as { success: unknown }).success === "boolean";
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

    // Same honest, non-percentage progress simulation as V1 — the base
    // stage sequence estimates a typical (native-text) analysis; only once
    // that sequence has run its course, and the request is still pending,
    // do OCR-specific stages start advancing (a signal that OCR is likely
    // running on a scanned PDF), never a claimed exact percentage.
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

        const res = await fetch("/api/analyze-contract", { method: "POST", body: formData });
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
          contractRagSessionId: body.contractRagSessionId ?? null,
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
  const isAr = pendingUpload.analysisLanguage === "ar";

  const stages: TimelineStage[] = ANALYSIS_PROGRESS_STAGES.map((stage, idx) => {
    const isCompleted = idx < completedCount || (idx === completedCount && ocrStageIndex >= 0);
    const isCurrent = idx === completedCount && ocrStageIndex < 0;
    const status: TimelineStage["status"] = isCompleted ? "completed" : failed && isCurrent ? "failed" : isCurrent ? "active" : "pending";
    return { label: progressStageLabel(stage, pendingUpload.analysisLanguage), status };
  });

  if (ocrStageIndex >= 0) {
    OCR_PROGRESS_STAGES.slice(0, ocrStageIndex + 1).forEach((stage, idx) => {
      const isCompleted = idx < ocrStageIndex;
      const isCurrent = idx === ocrStageIndex;
      const status: TimelineStage["status"] = isCompleted ? "completed" : failed && isCurrent ? "failed" : isCurrent ? "active" : "pending";
      stages.push({ label: progressStageLabel(stage, pendingUpload.analysisLanguage), status });
    });
  }

  const totalStageCount = ANALYSIS_PROGRESS_STAGES.length + (ocrStageIndex >= 0 ? OCR_PROGRESS_STAGES.length : 0);
  const doneCount = stages.filter((s) => s.status === "completed").length;
  const progressValue = failed ? 100 : Math.round((doneCount / totalStageCount) * 100);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      dir={isAr ? "rtl" : "ltr"}
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 px-6 py-10"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-lg border border-border bg-card p-8 text-center">
        <div
          className={
            "flex h-12 w-12 items-center justify-center rounded-full " +
            (failed ? "bg-v2-danger/10 text-v2-danger" : "bg-primary/10 text-primary")
          }
        >
          {failed ? <XCircle size={24} /> : <FileSearch size={24} />}
        </div>

        <div>
          <h2 className="text-lg font-bold text-foreground" data-testid="text-loading-heading">
            {failed ? copy.failedHeading : copy.heading}
          </h2>
          {!failed && <p className="mt-1 text-sm text-muted-foreground">{copy.subheading}</p>}
        </div>

        {!failed && <Progress value={progressValue} className="h-1.5 w-full" data-testid="loading-progress-bar" />}

        <div className="w-full text-start">
          <ProgressTimeline stages={stages} />
        </div>

        {failed && (
          <div className="flex w-full flex-col gap-3" data-testid="loading-error">
            <p className="text-sm text-v2-danger">{errorMessage}</p>
            <Button onClick={() => onNavigate("home")} data-testid="button-back-home" variant="secondary" className="w-full">
              {copy.backHome}
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
