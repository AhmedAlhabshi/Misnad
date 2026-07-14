import { createRequire } from "node:module";
import path from "node:path";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { ocrRecognitionFailedError } from "../errors";
import type { OcrPageResult, OcrProvider, OcrRunOptions, RenderedPdfPage } from "../types";

/** Used when the caller doesn't know the actual render DPI (e.g. a direct standalone call) — matches `pdfPageRenderer.ts`'s own ~300 DPI default. */
const DEFAULT_DPI = 300;

/**
 * Tuned once per worker (params persist for the worker's lifetime, so this
 * only runs once per lane, not once per page). Deliberately does NOT set
 * `tessedit_char_whitelist` — a contract page mixes Arabic/English prose,
 * numerals, percent signs, dates, and IBANs, so a restrictive whitelist would
 * silently drop legitimate characters instead of just tolerating noise.
 *
 * - `tessedit_pageseg_mode: AUTO` — a contract page mixes flowing paragraphs
 *   with a tabular installment schedule; Tesseract's full automatic layout
 *   analysis (mode 3) handles that mixed layout far better than forcing a
 *   single-block or single-column assumption (modes 4/6), which real
 *   contract PDFs don't actually have. This matches tesseract.js's own
 *   implicit default — set explicitly here so the choice is documented and
 *   deliberate rather than silently inherited.
 * - `preserve_interword_spaces: "1"` — keeps multi-word Arabic number
 *   phrases and table-column spacing intact, which the amount-in-words and
 *   installment-table recovery logic both depend on.
 * - `user_defined_dpi` — the rendered PNG carries no DPI metadata of its own
 *   (canvas images have none), so without this Tesseract falls back to
 *   guessing the resolution, which can silently degrade recognition on a
 *   page rendered well above the default 70 DPI Tesseract otherwise assumes.
 */
async function tuneWorkerParameters(worker: Worker, dpi: number | undefined): Promise<void> {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: "1",
    user_defined_dpi: String(dpi ?? DEFAULT_DPI),
  });
}

export interface TesseractProviderConfig {
  /**
   * Local directory tesseract.js caches downloaded `.traineddata` language
   * files in, so a language is only ever downloaded once per machine, never
   * re-fetched on every request. Defaults to a project-local `.cache`
   * directory (kept out of git).
   */
  cacheDir?: string;
}

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache", "tesseract");

const nodeRequire = createRequire(import.meta.url);
let cachedWorkerPath: string | null = null;

/**
 * tesseract.js's own default `workerPath` is computed internally from
 * `__dirname` relative to its own source file
 * (`tesseract.js/src/worker/node/defaultOptions.js`). That default is safe
 * when tesseract.js runs from its real, unbundled location — but once
 * `@workspace/document-ocr` is bundled by esbuild into a single output file
 * (e.g. `artifacts/api-server/dist/index.mjs`), every bundled module's
 * `__dirname` resolves to the *bundle's* directory instead, and
 * tesseract.js's relative `../../worker-script/node/index.js` traversal
 * then points at a nonexistent path outside `node_modules` entirely.
 *
 * `require.resolve` is a real Node module resolution call, not a
 * `__dirname`-relative string join — it is unaffected by bundling. Anchoring
 * it to *our own* `import.meta.url` (rather than trusting tesseract.js's
 * internal default) walks up from wherever this file actually runs
 * (bundled or not) through `node_modules` using Node's normal algorithm,
 * which correctly finds the real, installed `tesseract.js` package
 * regardless of pnpm's workspace symlink layout.
 */
export function resolveWorkerPath(): string {
  if (cachedWorkerPath === null) {
    cachedWorkerPath = nodeRequire.resolve("tesseract.js/src/worker-script/node/index.js");
  }
  return cachedWorkerPath;
}

/** A page recognition that neither finished within `pageTimeoutMs` nor was already settled when the overall run was aborted. */
class PageDeadlineExceeded extends Error {
  constructor() {
    super("page deadline exceeded");
    this.name = "PageDeadlineExceeded";
  }
}

/** Races `task` against a per-page timeout and the overall run's abort signal — whichever comes first. Never leaves a dangling timer. */
function raceAgainstDeadline<T>(task: Promise<T>, timeoutMs: number, signal: AbortSignal | undefined): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new PageDeadlineExceeded());
    }, timeoutMs);

    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new PageDeadlineExceeded());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    task.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

async function terminateQuietly(worker: Worker): Promise<void> {
  try {
    await worker.terminate();
  } catch {
    // The worker may already be dead (e.g. it crashed mid-recognition) — termination is best-effort cleanup, never a reason to fail the request.
  }
}

/**
 * Tesseract.js-backed `OcrProvider`. Creates at most `options.pageConcurrency`
 * workers for the whole document (never one per page) and terminates every
 * worker it creates before returning or throwing, including when a page
 * times out (that worker is killed and replaced so one stuck page cannot
 * permanently reduce concurrency for the rest of the document). Any worker
 * initialization failure (e.g. a spawn/module-resolution error) is caught
 * and converted into the project's structured `OCR_RECOGNITION_FAILED`
 * error — it never reaches the caller as a raw/uncaught exception.
 */
export function createTesseractOcrProvider(config: TesseractProviderConfig = {}): OcrProvider {
  const cachePath = config.cacheDir ?? DEFAULT_CACHE_DIR;

  return {
    async recognizePages(pages: readonly RenderedPdfPage[], options: OcrRunOptions): Promise<OcrPageResult[]> {
      if (pages.length === 0) return [];

      const laneCount = Math.max(1, Math.min(options.pageConcurrency, pages.length));
      const createdWorkers: Worker[] = [];

      async function createTrackedWorker(): Promise<Worker> {
        const worker = await createWorker(options.languages, undefined, {
          cachePath,
          workerPath: resolveWorkerPath(),
        });
        createdWorkers.push(worker);
        await tuneWorkerParameters(worker, options.dpi);
        return worker;
      }

      let nextPageIndex = 0;
      const results: OcrPageResult[] = [];

      /** Marks every not-yet-attempted page as failed (with a warning, never fabricated text) — used when this lane can no longer continue at all. */
      function failRemainingPages(reason: string): void {
        while (true) {
          const pageIndex = nextPageIndex++;
          if (pageIndex >= pages.length) return;
          const page = pages[pageIndex];
          results.push({ pageNumber: page.pageNumber, text: "", durationMs: 0, warning: `page ${page.pageNumber} ${reason}` });
        }
      }

      async function runLane(): Promise<void> {
        let worker: Worker;
        try {
          worker = await createTrackedWorker();
        } catch {
          // This lane never had a working worker at all — the pages it
          // would have processed are recorded as failed (not silently
          // dropped), and other lanes (if any) continue independently.
          failRemainingPages("could not be recognized (OCR worker failed to start)");
          return;
        }

        while (true) {
          if (options.signal?.aborted) return;
          const pageIndex = nextPageIndex++;
          if (pageIndex >= pages.length) return;
          const page = pages[pageIndex];
          const startedAt = Date.now();

          try {
            const recognizeResult = await raceAgainstDeadline(
              worker.recognize(page.png),
              options.pageTimeoutMs,
              options.signal,
            );
            results.push({
              pageNumber: page.pageNumber,
              text: recognizeResult.data.text,
              confidence: recognizeResult.data.confidence,
              durationMs: Date.now() - startedAt,
            });
          } catch (err) {
            const reason = err instanceof PageDeadlineExceeded ? "timed out" : "recognition error";
            results.push({
              pageNumber: page.pageNumber,
              text: "",
              durationMs: Date.now() - startedAt,
              warning: `page ${page.pageNumber} ${reason}`,
            });
            if (err instanceof PageDeadlineExceeded) {
              // The stuck recognition may still be running inside the killed
              // worker — terminate it and start a fresh one for the rest of
              // this lane's pages rather than waiting on it indefinitely.
              await terminateQuietly(worker);
              try {
                worker = await createTrackedWorker();
              } catch {
                failRemainingPages("could not be recognized (OCR worker failed to restart)");
                return;
              }
            }
          }
        }
      }

      try {
        await Promise.all(Array.from({ length: laneCount }, () => runLane()));
      } finally {
        await Promise.all(createdWorkers.map(terminateQuietly));
      }

      if (results.length > 0 && results.every((result) => result.warning)) {
        throw ocrRecognitionFailedError("every page failed to recognize");
      }

      return results.sort((a, b) => a.pageNumber - b.pageNumber);
    },
  };
}
