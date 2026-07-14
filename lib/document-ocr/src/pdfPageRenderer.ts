import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Canvas } from "@napi-rs/canvas";
// pdfjs-dist ships a legacy/Node-compatible build separate from its browser
// build — the browser build assumes DOM globals (window, document) that do
// not exist in Node.
import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ocrRenderFailedError } from "./errors";
import type { RenderedPdfPage } from "./types";

const require = createRequire(import.meta.url);
const pdfjsPackageDir = path.dirname(require.resolve("pdfjs-dist/package.json"));

let workerConfigured = false;

/**
 * pdf.js runs a "fake worker" in Node (no real `worker_threads`, no browser
 * Worker) — it just dynamically imports this module's exports in the same
 * thread. Configuring it once, to an absolute path, avoids depending on the
 * process's current working directory.
 */
function ensureWorkerConfigured(): void {
  if (workerConfigured) return;
  // The fake worker loads this via a plain ESM `import()`, which — unlike
  // `require.resolve`'s raw filesystem path — requires a `file://` URL on
  // Windows (a bare `C:\...` path is not a valid ESM specifier there).
  GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
  workerConfigured = true;
}

/**
 * Only used as a fallback for the standard 14 PDF fonts when a page does not
 * embed its own font program — most real contract PDFs embed their fonts,
 * so this mainly avoids visual glyph substitution artifacts on the pages
 * that don't. cMaps are for composite/CJK font encodings; harmless to
 * provide even for Arabic/English-only documents.
 */
function getDocumentAssetUrls(): { standardFontDataUrl: string; cMapUrl: string } {
  return {
    standardFontDataUrl: `${pathToFileURL(path.join(pdfjsPackageDir, "standard_fonts")).href}/`,
    cMapUrl: `${pathToFileURL(path.join(pdfjsPackageDir, "cmaps")).href}/`,
  };
}

async function loadPdfDocument(buffer: Buffer): Promise<{ loadingTask: PDFDocumentLoadingTask; document: PDFDocumentProxy }> {
  ensureWorkerConfigured();
  const { standardFontDataUrl, cMapUrl } = getDocumentAssetUrls();
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
  });
  try {
    const document = await loadingTask.promise;
    return { loadingTask, document };
  } catch (err) {
    throw ocrRenderFailedError(err instanceof Error ? err.message : "failed to load the PDF document");
  }
}

export interface RenderPdfPagesOptions {
  /** Render resolution multiplier over a page's native 72-DPI point size — higher improves OCR accuracy on small print/table text at the cost of memory/time. Callers going through `runOcrFallbackPipeline` get this from `OcrRuntimeConfig.renderScale` (configurable via `OCR_RENDER_SCALE`/`OCR_RENDER_DPI`); this default only applies when the function is used standalone. */
  scale?: number;
}

export interface RenderPdfPagesResult {
  pages: RenderedPdfPage[];
  /** Page numbers (1-based) that failed to render — the page is simply omitted from `pages`, never given fabricated content. */
  failedPageNumbers: number[];
}

/** ~300 DPI equivalent (300/72) — matches `config.ts`'s `DEFAULT_OCR_RUNTIME_CONFIG.renderScale`. */
const DEFAULT_RENDER_SCALE = 300 / 72;

/**
 * `PDFDocumentProxy.canvasFactory` is typed loosely (`Object`) in pdfjs-dist's
 * own declarations since it's meant as an internal detail, but its actual
 * shape (verified against the installed package's compiled source) is this
 * create/destroy pair — the same one `NodeCanvasFactory` (pdfjs-dist's own
 * built-in, Node-only factory that creates `@napi-rs/canvas` canvases)
 * implements.
 */
interface PdfCanvasFactory {
  create(width: number, height: number): { canvas: Canvas; context: unknown };
  destroy(canvasAndContext: { canvas: Canvas | null; context: unknown }): void;
}

/**
 * Renders the given 1-based page numbers to in-memory PNG buffers — never
 * writes anything to disk, so there are no temporary image files to clean
 * up. Pages are rendered strictly one at a time (never in parallel) to
 * bound memory use; a single page's rendering failure is recorded and
 * skipped rather than aborting the whole document, but a failure loading
 * the document itself (or every requested page failing) surfaces as
 * `OCR_RENDER_FAILED`.
 */
export async function renderPdfPagesToImages(
  buffer: Buffer,
  pageNumbers: readonly number[],
  options: RenderPdfPagesOptions = {},
): Promise<RenderPdfPagesResult> {
  const scale = options.scale ?? DEFAULT_RENDER_SCALE;
  const { loadingTask, document } = await loadPdfDocument(buffer);
  const canvasFactory = document.canvasFactory as unknown as PdfCanvasFactory;

  const pages: RenderedPdfPage[] = [];
  const failedPageNumbers: number[] = [];

  try {
    for (const pageNumber of pageNumbers) {
      let page: Awaited<ReturnType<typeof document.getPage>> | undefined;
      try {
        page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);
        const canvasAndContext = canvasFactory.create(width, height);

        try {
          const renderTask = page.render({
            canvas: canvasAndContext.canvas as unknown as HTMLCanvasElement,
            viewport,
          });
          await renderTask.promise;

          const png = await canvasAndContext.canvas.encode("png");
          pages.push({ pageNumber, png, width, height });
        } finally {
          canvasFactory.destroy(canvasAndContext);
        }
      } catch {
        failedPageNumbers.push(pageNumber);
      } finally {
        page?.cleanup();
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  if (pages.length === 0 && failedPageNumbers.length > 0) {
    throw ocrRenderFailedError(`every requested page (${failedPageNumbers.join(", ")}) failed to render`);
  }

  return { pages, failedPageNumbers };
}
