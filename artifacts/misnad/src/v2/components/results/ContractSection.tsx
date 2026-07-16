import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, FileText, Info } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { Button } from "@/components/ui/button";
import EmptyStateCard from "../ui/EmptyStateCard";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

type LoadState = "loading" | "ready" | "error";

/**
 * Same pdf.js load/render/cleanup effect structure as V1's `ContractTab.tsx`
 * — only the surrounding chrome is restyled. No automatic clause
 * highlighting (no reliable page/coordinate evidence exists in the current
 * schema/engine output), but `renderPage` stays isolated so a future
 * coordinate-bearing overlay can be added without restructuring this viewer.
 */
export default function ContractSection({ contractObjectUrl, language }: { contractObjectUrl: string | null; language: AnalysisLanguage }) {
  const copy = RESULTS_COPY[language];
  const isAr = language === "ar";
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
        if (cancelled) return;
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
      <div dir={isAr ? "rtl" : "ltr"}>
        <EmptyStateCard icon={FileText} title={copy.contract.noDocumentTitle} body={copy.contract.noDocumentBody} testId="contract-viewer-unavailable" />
      </div>
    );
  }

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="flex flex-col gap-4" data-testid="contract-viewer">
      <div className="flex items-start gap-2 rounded-lg border border-v2-info/20 bg-v2-info/5 p-3">
        <Info size={16} className="mt-0.5 shrink-0 text-v2-info" />
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.contract.highlightingNoteText}</p>
      </div>

      {state === "loading" && (
        <div className="flex items-center justify-center py-16" data-testid="contract-viewer-loading">
          <p className="text-sm text-muted-foreground">…</p>
        </div>
      )}

      <div className="flex w-full items-center justify-center overflow-auto rounded-lg border border-border bg-muted/30">
        <canvas ref={canvasRef} className={state === "ready" ? "h-auto max-w-full" : "hidden"} data-testid="contract-viewer-canvas" />
      </div>

      {state === "ready" && numPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            data-testid="button-contract-viewer-prev-page"
            aria-label={copy.contract.previousPage}
          >
            <ChevronLeft size={16} className={isAr ? "rotate-180" : ""} />
          </Button>
          <span className="text-sm text-muted-foreground" data-testid="text-contract-viewer-page-indicator">
            {copy.contract.page} {pageNumber} {copy.contract.of} {numPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            data-testid="button-contract-viewer-next-page"
            aria-label={copy.contract.nextPage}
          >
            <ChevronRight size={16} className={isAr ? "rotate-180" : ""} />
          </Button>
        </div>
      )}
    </div>
  );
}
