import { useRef, useState, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { FileText, ShieldCheck, Upload } from "lucide-react";
import {
  ANALYSIS_LANGUAGE_DISPLAY_NAMES,
  ANALYSIS_LANGUAGE_VALUES,
  CONTRACT_TYPES,
  type AnalysisLanguage,
  type ContractType,
} from "@workspace/contract-types";
import type { PendingUpload } from "@/types/analysis";
import { Button } from "@/components/ui/button";
import StepIndicator from "../components/ui/StepIndicator";

/**
 * The home screen's own chrome is Arabic-first (matching the brand), same
 * as V1 — `analysisLanguage` only affects the later analysis output
 * language, never this screen's own labels.
 */
const COPY = {
  brand: "مِسناد",
  tagline: "منصّة تحليل العقود القانونية والمالية",
  secureBadge: "تحليل آمن، محلي الجلسة",
  step1: "نوع العقد",
  step2: "لغة التحليل",
  step3: "رفع المستند",
  uploadTitle: "ارفع عقدك",
  uploadHint: "PDF فقط — يُحلَّل خلال ثوانٍ",
  invalidFile: "يُقبل ملف PDF فقط",
  cta: "تحليل العقد",
  ctaIncomplete: "أكمل الخطوات أعلاه للمتابعة",
  privacy: "ملفك لا يُخزّن — يُحلّل ويُحذف فوراً بعد انتهاء الجلسة.",
} as const;

export default function HomeScreen({
  onNavigate,
  onStartAnalysis,
}: {
  onNavigate: (s: string) => void;
  onStartAnalysis: (upload: PendingUpload) => void;
}) {
  const [selectedType, setSelectedType] = useState<ContractType | null>(null);
  const [analysisLanguage, setAnalysisLanguage] = useState<AnalysisLanguage | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAnalyze = Boolean(selectedType && analysisLanguage && selectedFile);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError(COPY.invalidFile);
      setSelectedFile(null);
      return;
    }
    setError(null);
    setSelectedFile(file);
  }

  function handleAnalyze() {
    if (!selectedType || !analysisLanguage || !selectedFile) return;
    setError(null);
    onStartAnalysis({ file: selectedFile, contractType: selectedType, analysisLanguage });
    onNavigate("loading");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      dir="rtl"
      className="flex min-h-[100dvh] flex-col gap-10 px-6 py-10 sm:px-10"
    >
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{COPY.brand}</h1>
          <p className="text-sm text-muted-foreground">{COPY.tagline}</p>
        </div>
        <div className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:flex">
          <ShieldCheck size={14} className="text-v2-success" />
          <span>{COPY.secureBadge}</span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8">
        <section className="flex flex-col gap-3">
          <StepIndicator step={1} label={COPY.step1} />
          <div className="flex flex-wrap gap-2">
            {CONTRACT_TYPES.map((type) => {
              const isSelected = selectedType === type.value;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setSelectedType(type.value)}
                  data-testid={`chip-contract-type-${type.value}`}
                  className={
                    "h-9 rounded-md border px-3.5 text-sm font-medium transition-colors " +
                    (isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted")
                  }
                >
                  {type.labelAr}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <StepIndicator step={2} label={COPY.step2} />
          <div className="flex gap-2">
            {ANALYSIS_LANGUAGE_VALUES.map((lang) => {
              const isSelected = analysisLanguage === lang;
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setAnalysisLanguage(lang)}
                  data-testid={`chip-analysis-language-${lang}`}
                  className={
                    "h-9 flex-1 rounded-md border text-sm font-semibold transition-colors " +
                    (isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted")
                  }
                >
                  {ANALYSIS_LANGUAGE_DISPLAY_NAMES[lang]}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <StepIndicator step={3} label={COPY.step3} />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            data-testid="input-file-upload"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            data-testid="upload-zone"
            className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center transition-colors hover:bg-muted/60"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Upload size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{COPY.uploadTitle}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{COPY.uploadHint}</p>
            </div>
            {selectedFile && (
              <span
                className="mt-1 inline-flex max-w-[280px] items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
                data-testid="text-selected-file"
              >
                <FileText size={13} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{selectedFile.name}</span>
              </span>
            )}
          </button>
          {error && (
            <p className="text-sm text-v2-danger" data-testid="text-upload-error">
              {error}
            </p>
          )}
        </section>

        <Button
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          size="lg"
          data-testid="button-analyze-contract"
          className="h-12 w-full text-base font-semibold"
        >
          {canAnalyze ? COPY.cta : COPY.ctaIncomplete}
        </Button>
      </div>

      <footer className="mx-auto flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck size={13} className="text-v2-success shrink-0" />
        <span>{COPY.privacy}</span>
      </footer>
    </motion.div>
  );
}
