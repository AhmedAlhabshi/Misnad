# @workspace/document-ocr

Scanned PDF OCR fallback for Misnad. Turns a PDF's raw bytes into trustworthy
text, deciding on its own whether the PDF's native text layer is usable or
whether OCR is needed — and if OCR runs, whether its result is actually
better than the native text.

## Pipeline

```
PDF Upload
  → Native PDF text extraction        (artifacts/api-server, pdf-parse)
  → Text Quality Gate                 (evaluateTextQuality)
  → OCR Fallback, only if needed      (renderPdfPagesToImages + Tesseract)
  → OCR Text Normalization            (normalizeOcrText)
  → PII Masking                       (artifacts/api-server, unchanged)
  → Contract Understanding            (lib/contract-analysis, unchanged)
  → Financial Metrics                 (lib/financial-metrics, unchanged)
```

The single entry point is `extractDocumentText(buffer)` in
`artifacts/api-server/src/services/documentParser.ts` — it is the only piece
of code that decides native vs. OCR. The route
(`artifacts/api-server/src/routes/analyzeContract.ts`) never inspects text
length or quality itself; it just calls that one function and forwards the
result into PII masking, exactly as before.

## Why OCR runs locally

The rendered page images and raw OCR text contain the customer's contract
content before PII masking has run. Nothing is sent to an external OCR
service — `tesseract.js` runs entirely in-process via WebAssembly, and PDF
rendering (`pdfjs-dist` + `@napi-rs/canvas`) never writes anything to disk;
rendered pages stay as in-memory PNG buffers for the lifetime of one
request.

## Modules

| File | Responsibility |
|---|---|
| `types.ts` | `DocumentExtractionResult`, `OcrProvider` interface, etc. |
| `textQuality.ts` | `evaluateTextQuality(text, pageCount)` — the quality gate |
| `textNormalizer.ts` | `normalizeOcrText(text)` — conservative post-OCR cleanup |
| `pdfPageRenderer.ts` | Renders PDF pages to in-memory PNGs via `pdfjs-dist` |
| `ocrProvider/tesseractProvider.ts` | The concrete `OcrProvider`, backed by `tesseract.js` |
| `runOcrFallbackPipeline.ts` | Orchestrates render → recognize → merge → compare |
| `config.ts` | `OCR_*` environment variable parsing, with defaults |
| `errors.ts` | `DocumentOcrError` + typed error codes |

`OcrProvider` is the only seam Tesseract is wired through — nothing else in
the app imports `tesseract.js` directly. Swapping in an external/cloud OCR
provider later means implementing `OcrProvider.recognizePages` once; no
other file changes.

## Text Quality Gate

`evaluateTextQuality(text, pageCount)` scores structural signals — it never
depends on a specific Arabic or English word, since contracts vary:

- characters per page (density)
- ratio of Arabic/English/digit/punctuation ("readable") characters
- mojibake markers (`Ù`, `Ø`, `Ã`, `Â` — the classic UTF-8-as-Latin1
  mis-decode pattern, e.g. `Ù…Ø¨Ù„Øº`)
- Unicode replacement character (`�`) count
- abnormal repetition of a single non-alphanumeric symbol
- share of whitespace-separated tokens that look like real words/numbers

It returns `{ quality: "good" | "partial" | "poor", score, shouldUseOcr,
warnings, metrics }`. Thresholds live in `TEXT_QUALITY_THRESHOLDS` in
`textQuality.ts`, documented inline.

Decision rule: `good` → use native text as-is. `poor` → OCR. `partial` →
OCR only if the score is still low enough to lean that way. If OCR runs, the
pipeline compares the OCR result's own quality score against the native
text's and keeps whichever is actually better — OCR is never assumed to
automatically win.

## OCR languages

Tesseract runs with `ara+eng` (both Arabic and English) by default,
configurable via `OCR_LANGUAGES`. Each page is recognized independently and
merged with page markers that preserve page numbers for future evidence
highlighting:

```
--- PAGE 1 ---
النص هنا...

--- PAGE 2 ---
More text here...
```

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `OCR_ENABLED` | `true` | Master switch. When `false`, a document needing OCR fails with `OCR_DISABLED` instead of running it. |
| `OCR_MAX_PAGES` | `30` | Documents with more pages are rejected (`OCR_PAGE_LIMIT_EXCEEDED`) before any rendering starts. |
| `OCR_TIMEOUT_MS` | `120000` | Budget for the whole OCR run (render + recognize every page). |
| `OCR_PAGE_TIMEOUT_MS` | `30000` | Budget for a single page; a page that exceeds this is skipped (not fatal) and its worker is replaced. |
| `OCR_PAGE_CONCURRENCY` | `1` | How many pages may be recognized concurrently (bounds memory/CPU). |
| `OCR_LANGUAGES` | `ara+eng` | Tesseract language spec. |

Set in `artifacts/api-server/.env`.

## Error codes

`DocumentOcrError` (`lib/document-ocr/src/errors.ts`) carries one of:
`OCR_DISABLED`, `OCR_RENDER_FAILED`, `OCR_RECOGNITION_FAILED`, `OCR_TIMEOUT`,
`OCR_PAGE_LIMIT_EXCEEDED`, `DOCUMENT_TEXT_UNREADABLE`. The API route
surfaces these as `{ success: false, message, code }` with HTTP 422.

## Language data caching

`tesseract.js` downloads `.traineddata` files (Arabic + English) once and
caches them on disk under `<api-server cwd>/.cache/tesseract` (gitignored —
never commit trained-data files). Subsequent OCR runs reuse the cached
files instead of re-downloading. Delete that directory to force a fresh
download.

## Running OCR locally (Windows)

No system Tesseract, Ghostscript, or Python install is required —
`tesseract.js` (WASM) and `pdfjs-dist` + `@napi-rs/canvas` (prebuilt
binaries, including `win32-x64-msvc`) are pure npm dependencies. Just
`pnpm install` at the repo root and run `artifacts/api-server` normally; the
first scanned-PDF request downloads the language data once.

## Tests

Fast suite (no real Tesseract — a fake `OcrProvider`/renderer is injected):

```bash
pnpm --filter @workspace/document-ocr test
```

Slow suite (real Tesseract, real PDF rendering — intentionally separate,
takes tens of seconds):

```bash
pnpm --filter @workspace/document-ocr run test:real-ocr
```

`artifacts/api-server`'s own test suite also covers native-vs-OCR routing,
partial-page-failure tolerance, OCR-disabled/page-limit errors, and PII
masking running correctly on OCR-derived text:

```bash
pnpm --filter @workspace/api-server test
```

## Known limitations / out of scope

- Handwriting recognition is not supported (Tesseract is a printed-text OCR engine).
- Uploading a standalone JPG/PNG is out of scope — only PDF upload is handled.
- No AI-based text correction is ever applied to OCR output.
- OCR does not produce a new searchable PDF (no OCRmyPDF-style output).
- No external/cloud OCR provider is used — everything runs locally in-process.
- Full evidence highlighting (mapping a clause back to its exact page/region) is out of scope; only page numbers are preserved for future use.
- A rendering-only cosmetic warning ("Unable to load font data ...") may appear in logs when a PDF's non-embedded standard font's hinting file cannot be read via a `file://` URL in Node — this does not affect recognition (verified: the rendered page is still fully legible to Tesseract), it only affects a font-rendering optimization.
