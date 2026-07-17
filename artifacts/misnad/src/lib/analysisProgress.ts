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
  { labelAr: "حساب المؤشرات المالية", labelEn: "Calculating financial metrics" },
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

/**
 * Extra ticks counted only once the request is still pending after the
 * normal (native-text) stage sequence would already have finished — an
 * honest, non-fabricated signal that the wait has gone on long enough to
 * plausibly be OCR, backend Gemini key rotation/retries, or provider
 * fallback. `OCR_PROGRESS_STAGES.length` only bounds how many extra ticks
 * this counts up to; the granular labels themselves are never rendered.
 *
 * Critically, this signal must never be allowed to make progress appear to
 * move backward: it is folded into `computeMainStageStatuses` via
 * `Math.max` against whatever `completedCount` has already (monotonically)
 * reached, so a long wait can only ever keep the final stage active for
 * longer — never regress an already-completed stage back to active/pending.
 */
export const OCR_PROGRESS_STAGES: readonly ProgressStageDefinition[] = [
  { labelAr: "جاري فحص جودة النص", labelEn: "Checking text quality" },
  { labelAr: "جاري تحويل صفحات العقد", labelEn: "Rendering contract pages" },
  { labelAr: "جاري قراءة العقد المصور", labelEn: "Reading the scanned contract" },
  { labelAr: "جاري تجهيز النص", labelEn: "Preparing the text" },
];

/**
 * Shown in place of the final stage's normal status line once the request
 * has been pending long enough that the extra "OCR/backend-retry" ticks
 * above have started (i.e. the estimated sequence has fully run its
 * course but the real response still hasn't arrived) — reassures the user
 * without claiming a specific cause (OCR, Gemini key rotation, provider
 * fallback, or simple network latency could each explain it).
 */
export const FINAL_STAGE_EXTENDED_WAIT_STATUS = {
  ar: "جاري إنهاء التقرير...",
  en: "Finalizing your report...",
} as const;

export interface MainProgressStageDefinition {
  labelAr: string;
  labelEn: string;
  statusAr: string;
  statusEn: string;
}

/**
 * A simplified, non-technical view over the same estimated progress timer
 * above — groups the granular technical stages into 5 stages a non-technical
 * user can follow. Purely a presentation grouping; it does not change what
 * is actually being tracked (the same completedCount/ocrStageIndex timer).
 */
export const MAIN_PROGRESS_STAGES: readonly MainProgressStageDefinition[] = [
  {
    labelAr: "تجهيز العقد",
    labelEn: "Preparing the contract",
    statusAr: "جاري تجهيز الملف...",
    statusEn: "Preparing your file...",
  },
  {
    labelAr: "قراءة وفهم العقد",
    labelEn: "Reading and understanding the contract",
    statusAr: "جاري قراءة محتوى العقد...",
    statusEn: "Reading the contract content...",
  },
  {
    labelAr: "تحليل البنود والالتزامات",
    labelEn: "Analyzing clauses and obligations",
    statusAr: "جاري تحليل البنود والالتزامات...",
    statusEn: "Analyzing clauses and obligations...",
  },
  {
    labelAr: "إعداد التحليل المالي",
    labelEn: "Preparing the financial analysis",
    statusAr: "جاري حساب المؤشرات المالية...",
    statusEn: "Calculating the financial metrics...",
  },
  {
    labelAr: "تجهيز التقرير",
    labelEn: "Finalizing the report",
    statusAr: "جاري إعداد التقرير النهائي...",
    statusEn: "Preparing the final report...",
  },
];

export function mainStageLabel(stage: MainProgressStageDefinition, language: AnalysisLanguage): string {
  return language === "ar" ? stage.labelAr : stage.labelEn;
}

export function mainStageStatusMessage(stage: MainProgressStageDefinition, language: AnalysisLanguage): string {
  return language === "ar" ? stage.statusAr : stage.statusEn;
}

/**
 * Which main stage (index into MAIN_PROGRESS_STAGES) each ANALYSIS_PROGRESS_STAGES
 * entry belongs to, in the same order:
 *   0 Uploading file                    -> 0 Preparing the contract
 *   1 Reading contract                  -> 1 Reading and understanding
 *   2 Extracting text                   -> 1 Reading and understanding
 *   3 Masking sensitive information     -> 1 Reading and understanding
 *   4 Detecting contract type           -> 1 Reading and understanding
 *   5 Analyzing clauses and obligations -> 2 Analyzing clauses and obligations
 *   6 Calculating financial metrics     -> 3 Preparing the financial analysis
 *   7 Preparing summary                -> 4 Finalizing the report
 *   8 Finalizing result                 -> 4 Finalizing the report
 */
const BASE_STAGE_TO_MAIN_STAGE: readonly number[] = [0, 1, 1, 1, 1, 2, 3, 4, 4];

/**
 * OCR-only work (text-quality check, page rendering, reading the scanned
 * contract, preparing its text) is real backend work that happens while the
 * contract is being read — it is absorbed into the "reading and
 * understanding" main stage rather than exposed as its own completed step,
 * so it never falsely appears as a later stage (e.g. financial analysis or
 * finalizing the report) racing ahead while OCR is still running.
 */
const OCR_ACTIVE_MAIN_STAGE_INDEX = 1;

export type MainStageStatus = "pending" | "active" | "completed" | "failed";

/**
 * Derives each of the 5 main stages' status from the same real timer state
 * the technical stage list already uses (completedCount/ocrStageIndex never
 * change here) — a main stage is only ever shown as completed once the
 * current technical progress has genuinely moved past every technical stage
 * folded into it.
 *
 * Progress is strictly monotonic by construction: `completedCount` only
 * ever increases (or jumps to the end on real success) and its mapped main
 * index is non-decreasing; `ocrStageIndex` only ever increases (or stays
 * -1) and its mapped index is likewise non-decreasing. Taking the maximum
 * of the two therefore can never move backward — a long wait (whether
 * caused by OCR, backend Gemini key rotation/retries, provider fallback,
 * or plain network latency) can only ever hold or extend the current
 * stage, never regress an already-completed stage back to active/pending.
 * (A previous version let `ocrStageIndex >= 0` *override* the index
 * outright instead of floor it, which could regress progress from a later
 * stage — e.g. "Preparing the financial analysis" — back down to
 * "Reading and understanding" once the estimated sequence ran long; fixed
 * here.)
 */
export function computeMainStageStatuses(params: {
  completedCount: number;
  ocrStageIndex: number;
  failed: boolean;
}): MainStageStatus[] {
  const { completedCount, ocrStageIndex, failed } = params;

  const completedCountIndex =
    completedCount >= ANALYSIS_PROGRESS_STAGES.length
      ? MAIN_PROGRESS_STAGES.length
      : (BASE_STAGE_TO_MAIN_STAGE[completedCount] ?? MAIN_PROGRESS_STAGES.length - 1);

  const ocrIndex = ocrStageIndex >= 0 ? OCR_ACTIVE_MAIN_STAGE_INDEX : -1;

  const currentMainIndex = Math.max(completedCountIndex, ocrIndex);

  return MAIN_PROGRESS_STAGES.map((_, idx) => {
    if (idx < currentMainIndex) return "completed";
    if (idx > currentMainIndex) return "pending";
    return failed ? "failed" : "active";
  });
}

/**
 * True once the request has been pending long enough that the extra
 * "extended wait" ticks have started (the estimated sequence has fully run
 * its course but the real response still hasn't arrived) — used only to
 * pick which status message to show under the final stage, never to alter
 * stage completion/active state (see `computeMainStageStatuses`).
 */
export function isFinalStageExtendedWait(ocrStageIndex: number): boolean {
  return ocrStageIndex >= 0;
}
