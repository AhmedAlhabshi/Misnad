import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, FileText, Info } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import { RESULTS_COPY } from "@/lib/resultsCopy";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

type LoadState = "loading" | "ready" | "error";

/**
 * Renders the originally uploaded PDF (`contractObjectUrl` — a same-session
 * `URL.createObjectURL`, see `StoredAnalysisResult`) to a `<canvas>` using
 * `pdfjs-dist`, one page at a time. No automatic clause highlighting is
 * implemented yet — no reliable page/coordinate evidence exists anywhere in
 * the current schema/engine output (see the Overview/Contract Finances
 * tabs' own evidence-deferral notes) — but `renderPage` is isolated so a
 * future coordinate-bearing overlay can be added without restructuring this
 * viewer. Contract-type agnostic: works identically for every contract.
 */
export default function ContractTab({ contractObjectUrl, language }: { contractObjectUrl: string | null; language: AnalysisLanguage }) {
  const copy = RESULTS_COPY[language];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    if (!contractObjectUrl) {
      setState("error");
      return;
    }

    let cancelled = false;
    setState("loading");
    setPageNumber(1);

    const loadingTask = pdfjsLib.getDocument({ url: contractObjectUrl });
    loadingTask.promise
      .then((pdf) => {
        if (cancelled) {
          return;
        }
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
      pdfRef.current = null;
      loadingTask.destroy();
    };
  }, [contractObjectUrl]);

  useEffect(() => {
    if (state !== "ready" || !pdfRef.current || !canvasRef.current) {
      return;
    }

    let cancelled = false;
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;

    async function renderPage(): Promise<void> {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale: 1.4 });
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvas, canvasContext: context, viewport }).promise;
    }

    renderPage().catch(() => {
      if (!cancelled) setState("error");
    });

    return () => {
      cancelled = true;
    };
  }, [state, pageNumber]);

  if (!contractObjectUrl || state === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center" data-testid="contract-viewer-unavailable">
        <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground">
          <FileText size={26} />
        </div>
        <div className="max-w-sm">
          <h2 className="text-[15px] font-bold text-white mb-2">{copy.contract.noDocumentTitle}</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{copy.contract.noDocumentBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="contract-viewer">
      <div className="flex items-start gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-3">
        <Info size={16} className="text-indigo-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-muted-foreground leading-relaxed">{copy.contract.highlightingNoteText}</p>
      </div>

      {state === "loading" && (
        <div className="flex items-center justify-center py-16" data-testid="contract-viewer-loading">
          <p className="text-[13px] text-muted-foreground">…</p>
        </div>
      )}

      <div className="w-full overflow-auto rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
        <canvas ref={canvasRef} className={state === "ready" ? "max-w-full h-auto" : "hidden"} data-testid="contract-viewer-canvas" />
      </div>

      {state === "ready" && numPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            data-testid="button-contract-viewer-prev-page"
            aria-label={copy.contract.previousPage}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white disabled:opacity-30"
          >
            <ChevronLeft size={16} className={language === "ar" ? "rotate-180" : ""} />
          </button>
          <span className="text-[13px] text-muted-foreground" data-testid="text-contract-viewer-page-indicator">
            {copy.contract.page} {pageNumber} {copy.contract.of} {numPages}
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            data-testid="button-contract-viewer-next-page"
            aria-label={copy.contract.nextPage}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white disabled:opacity-30"
          >
            <ChevronRight size={16} className={language === "ar" ? "rotate-180" : ""} />
          </button>
        </div>
      )}
    </div>
  );
}
