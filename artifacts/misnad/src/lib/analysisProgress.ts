import type { AnalysisLanguage } from "@workspace/contract-types";

export type ProgressStageStatus = "pending" | "active" | "completed" | "failed";

export interface ProgressStageDefinition {
  labelAr: string;
  labelEn: string;
}

/**
 * The backend returns one final response and does not stream real progress.
 * These stages are an estimated UI-only sequence that advances over time
 * while the request is in flight — they do not reflect exact server state.
 */
export const ANALYSIS_PROGRESS_STAGES: readonly ProgressStageDefinition[] = [
  { labelAr: "رفع الملف", labelEn: "Uploading file" },
  { labelAr: "قراءة العقد", labelEn: "Reading contract" },
  { labelAr: "استخراج النص", labelEn: "Extracting text" },
  { labelAr: "إخفاء المعلومات الحساسة", labelEn: "Masking sensitive information" },
  { labelAr: "تحديد نوع العقد", labelEn: "Detecting contract type" },
  { labelAr: "تحليل البنود والالتزامات", labelEn: "Analyzing clauses and obligations" },
  { labelAr: "إعداد الملخص", labelEn: "Preparing summary" },
  { labelAr: "تجهيز النتيجة", labelEn: "Finalizing result" },
];

export function progressStageLabel(
  stage: ProgressStageDefinition,
  language: AnalysisLanguage,
): string {
  return language === "ar" ? stage.labelAr : stage.labelEn;
}

/**
 * The estimated timer may mark at most this many stages as completed on its
 * own — always leaving the final stage active (not completed) until the
 * real API response arrives, so completion is never claimed before the
 * server actually responds.
 */
export const MAX_AUTO_COMPLETED_STAGES = ANALYSIS_PROGRESS_STAGES.length - 1;
