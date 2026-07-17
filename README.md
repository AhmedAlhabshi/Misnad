# مِسناد | Misnad

**Misnad** is an AI-assisted contract analysis platform focused on Saudi consumer financial and legal contracts (auto finance, personal finance, mortgages, credit cards, leases, insurance, employment, and subscriptions). It reads an uploaded contract PDF, extracts and understands its content, computes the underlying financial obligations deterministically, grounds a chat assistant in the contract's own text plus relevant Saudi regulatory sources, and presents everything bilingually in Arabic and English.

> This README documents the codebase as it actually exists in this repository. It does not describe planned or aspirational features beyond what is implemented and verifiable in the source.

---

## Table of contents

- [Project overview](#project-overview)
- [Problem statement](#problem-statement)
- [Solution](#solution)
- [Key features](#key-features)
- [Supported contract types](#supported-contract-types)
- [How the system works](#how-the-system-works)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Installation requirements](#installation-requirements)
- [Environment variables](#environment-variables)
- [Backend setup and run commands](#backend-setup-and-run-commands)
- [Frontend setup and run commands](#frontend-setup-and-run-commands)
- [Testing commands](#testing-commands)
- [Privacy and security](#privacy-and-security)
- [Current limitations](#current-limitations)
- [Future work](#future-work)
- [Disclaimer](#disclaimer)
- [Team members](#team-members)

---

## Project overview

Misnad ("مِسناد", roughly "a support/prop that something leans on") is a monorepo containing a Node/Express API server and a React single-page frontend. A user uploads a contract PDF and selects a contract type and language; the system extracts the text (with an OCR fallback for scanned documents), masks personally identifiable information before any AI call, runs a structured "contract understanding" analysis, computes financial metrics deterministically from the extracted data, and exposes the results through a tabbed results screen with an optional personalized financial impact analysis and a grounded chat assistant ("Ask Misnad").

## Problem statement

Consumer financial and lease contracts in Saudi Arabia are often long, written in dense legal/financial language, and — for many people — only available as a scanned or exported PDF. Understanding the real financial exposure of a contract (total cost, monthly commitment, penalties, conditional fees) and how it relates to one's own budget, or getting a straight answer to a specific question about a clause, typically requires either specialized knowledge or paying for professional review. This creates a real risk of signing agreements without fully understanding their financial and legal implications.

## Solution

Misnad combines:

- **Deterministic extraction and calculation** (financial metrics are computed in code from the extracted contract data, not asserted by an AI model) with
- **AI-assisted understanding** (Google Gemini, with an OpenRouter fallback) for summarizing clauses, generating a personalized financial-impact narrative, and answering free-form questions, and
- **Retrieval-grounded answers** — the contract's own text and a curated set of official Saudi regulatory sources are retrieved and cited rather than left to the model's unverified recollection.

The result is a bilingual (Arabic/English) results screen and chat experience that is transparent about what is a computed fact versus an AI-generated interpretation.

## Key features

All features below are implemented in this repository and are reflected in the source paths noted.

- **PDF contract upload** — a single PDF is uploaded via `multipart/form-data` to the analysis endpoint (`artifacts/api-server/src/routes/analyzeContract.ts`).
- **Native text extraction** — text-layer extraction from the PDF is attempted first (`pdf-parse`, `pdfjs-dist`).
- **OCR fallback** — when native extraction quality is insufficient (e.g. a scanned document), pages are rendered and run through Tesseract OCR (`@workspace/document-ocr`), with Arabic + English language support and a deterministic financial-text recovery pass for numbers/amounts.
- **PII masking** — before any text reaches an AI provider, names, Saudi national IDs, Iqama numbers, commercial registration numbers, phone numbers, emails, IBANs, and bank account numbers are detected and masked (`artifacts/api-server/src/services/piiMasker.ts`).
- **Contract understanding** — a structured, schema-validated analysis (parties, financial obligations, dates, penalties, fees, important clauses with risk levels and plain-language explanations, missing information) produced via Gemini/OpenRouter against a strict JSON schema (`@workspace/contract-analysis`, `@workspace/contract-schema`).
- **Financial metrics engine** — a deterministic (non-AI) calculation pipeline that classifies extracted amounts and derives payment obligations, contract duration, recurring commitments, total cost, penalties, fees, and financial-exposure ratios (`@workspace/financial-metrics`).
- **Personalized financial analysis** — given a user's own budget inputs (income, expenses, existing debt, savings), an AI-generated, evidence-grounded breakdown of personal impact, things to watch, and pre-signing advice/questions (`analyzePersonalizedFinancialImpact` in `@workspace/contract-analysis`).
- **Contract RAG** — the masked contract text is chunked, embedded, and indexed per-session so the chat assistant can retrieve and cite the actual contract text (`@workspace/contract-rag`).
- **Legal RAG** — a curated collection of official Saudi regulatory sources (SAMA, the Civil Transactions Law, the Labor Law, lease/Ejar regulation, Insurance Authority regulation) is chunked, embedded, and retrievable for legal-context questions (`@workspace/legal-rag`).
- **Contract chat ("Ask Misnad")** — a question-routing layer (`@workspace/chat-router`) classifies each question (contract / legal / financial / general / combined), a context builder (`@workspace/context-builder`) assembles the relevant grounded evidence, and an answer composer (`@workspace/answer-composer`) generates a citation-checked answer.
- **Arabic and English support** — contract type labels, the analysis language, and the entire results/chat UI are bilingual, with RTL layout for Arabic.
- **PDF summary/report generation** — a downloadable PDF report of the analysis results is generated client-side in the browser (`@react-pdf/renderer`, `artifacts/misnad/src/lib/pdf/generateReportPdf.tsx`).
- **Gemini key rotation and OpenRouter fallback** — multiple Gemini API keys can be configured; a key pool rotates past rate-limited, temporarily-unavailable, or slow/unresponsive keys without waiting on a hung request, and the whole pipeline falls back to OpenRouter when every configured Gemini key is exhausted (`@workspace/gemini-key-pool`, `@workspace/contract-analysis`).

## Supported contract types

Defined in `@workspace/contract-types`:

| Value | Arabic label | English label |
|---|---|---|
| `auto_finance` | تمويل سيارة | Auto Finance |
| `personal_finance` | تمويل شخصي | Personal Finance |
| `mortgage` | تمويل عقاري | Mortgage |
| `credit_card` | بطاقة ائتمانية | Credit Card |
| `lease` | عقد إيجار | Lease |
| `insurance` | تأمين | Insurance |
| `employment` | عقد عمل | Employment Contract |
| `subscription` | اشتراك | Subscription |
| `other` | أخرى | Other |

## How the system works

The contract-analysis pipeline, end to end:

```
Upload → Extract/OCR → Quality Check → PII Masking → Contract Analysis → Financial Metrics → RAG → Results/Chat
```

1. **Upload** — the user selects a contract type and language and uploads a PDF (`POST /api/analyze-contract`).
2. **Extract/OCR** — native text extraction is attempted first; if the extracted text's quality is insufficient, the document is rendered page-by-page and OCR'd (Tesseract, Arabic + English), including a deterministic recovery pass for financial figures.
3. **Quality check** — the extracted text is scored for usability before it is trusted for masking/analysis.
4. **PII masking** — identifying data is detected and replaced with placeholders before any text is sent to an AI provider.
5. **Contract analysis** — the masked text is sent to Gemini (falling back to OpenRouter on rate-limit/availability failure) against a strict JSON schema, producing structured contract understanding (clauses, obligations, dates, penalties, fees, risk levels, plain explanations).
6. **Financial metrics** — a deterministic engine (no AI) classifies the extracted financial data and computes payment obligations, duration, recurring commitments, total cost, and exposure ratios.
7. **RAG indexing** — the masked contract text is chunked and embedded for Contract RAG; Legal RAG's regulatory source collection is queried as needed.
8. **Results/Chat** — the frontend renders a tabbed results screen (overview, financial obligations, personalized analysis, contract viewer, chat) and supports free-form, evidence-grounded questions through the chat assistant, plus a downloadable PDF report.

## Technology stack

**Monorepo / tooling**
- pnpm workspaces (`pnpm-workspace.yaml`), TypeScript project references, `tsx` for running TypeScript test/scripts directly, `esbuild` for the backend bundle.

**Backend** (`artifacts/api-server`, `@workspace/api-server`)
- Node.js, TypeScript (ESM), Express 5, `pino`/`pino-http` logging, `multer` (file upload), `pdf-parse` + `pdfjs-dist` (text/page extraction), `tesseract.js` (OCR), `@napi-rs/canvas` (PDF page rendering for OCR).

**Frontend** (`artifacts/misnad`, `@workspace/misnad`)
- React 19, Vite 7, TypeScript, Tailwind CSS v4, Radix UI primitives, TanStack Query, `react-hook-form`, `pdfjs-dist` (in-app contract viewer), `@react-pdf/renderer` (downloadable report generation), Vitest + React Testing Library (component tests).

**AI providers**
- Google Gemini (`@google/genai`) as the primary provider for contract analysis, personalized analysis, and chat answer composition, with a multi-key rotation pool.
- OpenRouter (HTTP API) as the fallback provider when Gemini is rate-limited or unavailable.

**Data storage**
- PostgreSQL via Drizzle ORM (`drizzle-orm`, `pg`), including the `pgvector` extension for Legal RAG and Contract RAG embeddings.

## Repository structure

```
Misnad/
├── artifacts/
│   ├── api-server/         @workspace/api-server   — Express backend (routes, services, PII masking)
│   ├── misnad/             @workspace/misnad       — React frontend (the actual product UI)
│   └── mockup-sandbox/     @workspace/mockup-sandbox — separate Vite sandbox for UI/design exploration
├── lib/
│   ├── answer-composer/    @workspace/answer-composer    — grounded chat answer generation + citation checking
│   ├── api-client-react/   @workspace/api-client-react   — generated API client (scaffolded, not yet wired into the frontend)
│   ├── api-spec/           @workspace/api-spec           — OpenAPI spec source (currently only documents /healthz)
│   ├── api-zod/            @workspace/api-zod            — shared Zod schemas for API contracts
│   ├── chat-router/        @workspace/chat-router        — classifies chat questions into contract/legal/financial/general routes
│   ├── context-builder/    @workspace/context-builder    — merges contract/legal/financial evidence into one grounded context
│   ├── contract-analysis/  @workspace/contract-analysis  — Gemini/OpenRouter providers + contract & personalized analysis services
│   ├── contract-rag/       @workspace/contract-rag       — per-session contract text chunking/embedding/retrieval
│   ├── contract-schema/    @workspace/contract-schema    — Zod schema for "contract understanding" + JSON Schema conversion
│   ├── contract-types/     @workspace/contract-types     — contract type & language enums/definitions
│   ├── db/                 @workspace/db                 — Drizzle ORM schema + Postgres connection
│   ├── document-ocr/       @workspace/document-ocr       — text-quality scoring + Tesseract OCR fallback pipeline
│   ├── financial-metrics/  @workspace/financial-metrics  — deterministic financial calculation engine
│   ├── gemini-key-pool/    @workspace/gemini-key-pool    — multi-key Gemini rotation, cooldown, attempt timeout, diagnostics
│   └── legal-rag/          @workspace/legal-rag          — Saudi regulatory source ingestion + retrieval
├── scripts/                 @workspace/scripts            — verification/ingestion CLI scripts (tsx-run)
├── pnpm-workspace.yaml
├── package.json              (root: build/typecheck orchestration only)
└── README.md
```

## Installation requirements

- **Node.js** (a recent LTS version; the codebase uses modern ESM/TypeScript syntax throughout).
- **pnpm** — this repository enforces pnpm via a `preinstall` check (`enforce-pnpm.cjs`); installing with `npm` or `yarn` will fail.
- **PostgreSQL** with the `pgvector` extension available (required for Legal RAG and Contract RAG storage/retrieval; `DATABASE_URL` must point at this database).
- **A Google Gemini API key** (or several, for key rotation) for AI-assisted analysis, personalized analysis, and chat.
- **An OpenRouter API key** (optional but recommended) for the automatic fallback path when Gemini is rate-limited or unavailable.

## Environment variables

The backend (`artifacts/api-server`) loads its environment from a `.env` file at startup (`--env-file=.env`). Copy the example file and fill in real values:

```bash
cp artifacts/api-server/.env.example artifacts/api-server/.env
```

`.env` and `.env.*` are git-ignored (only `.env.example` is tracked) — see [Privacy and security](#privacy-and-security).

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | Port the API server listens on. |
| `DATABASE_URL` | Yes | PostgreSQL connection string (with `pgvector` available) used by Legal RAG and Contract RAG. |
| `GEMINI_API_KEYS` | Yes (or `GEMINI_API_KEY`) | Comma-separated list of Gemini API keys for the rotation pool. |
| `GEMINI_API_KEY` | Fallback | Single-key fallback, used only if `GEMINI_API_KEYS` is not set — kept for backward compatibility. |
| `GEMINI_MODEL` | No | Gemini model id. Defaults to `gemini-2.5-flash` if unset. |
| `GEMINI_KEY_COOLDOWN_SECONDS` | No | How long a rate-limited/unavailable Gemini key is skipped before being retried. Defaults to `120`. |
| `GEMINI_ATTEMPT_TIMEOUT_MS` | No | Per-key timeout for a single Gemini call before it is abandoned and rotated past. Defaults to `10000`. |
| `OPENROUTER_API_KEY` | Recommended | Enables the OpenRouter fallback path used when Gemini is rate-limited/unavailable. |

Additional, less commonly changed variables exist for OCR tuning (`OCR_ENABLED`, `OCR_MAX_PAGES`, `OCR_TIMEOUT_MS`, `OCR_PAGE_TIMEOUT_MS`, `OCR_PAGE_CONCURRENCY`, `OCR_LANGUAGES`, `OCR_RENDER_SCALE` / `OCR_RENDER_DPI`, `OCR_PREPROCESSING_ENABLED`), Contract RAG limits (`CONTRACT_RAG_TTL_MINUTES`, `CONTRACT_RAG_MAX_INDEXED_CHARS`, and related `CONTRACT_RAG_*` caps), the embedding model (`GEMINI_EMBEDDING_MODEL`), the OpenRouter model (`OPENROUTER_MODEL`), and logging (`LOG_LEVEL`, `NODE_ENV`) — all have safe built-in defaults and are documented as comments in `.env.example`.

The frontend (`artifacts/misnad`) requires `PORT` and `BASE_PATH` for its Vite dev server/build (see [Frontend setup and run commands](#frontend-setup-and-run-commands)).

## Backend setup and run commands

From the repository root (pnpm workspaces resolve everything from here):

```bash
pnpm install

cp artifacts/api-server/.env.example artifacts/api-server/.env
# edit artifacts/api-server/.env with real values

cd artifacts/api-server
pnpm run build     # bundles the server with esbuild into dist/
pnpm run start      # runs the built server (node --env-file=.env ./dist/index.mjs)
```

Or, for the combined build-then-start convenience script:

```bash
cd artifacts/api-server
pnpm run dev        # NODE_ENV=development, then build + start
```

Other backend scripts:

```bash
pnpm run typecheck   # tsc --noEmit
pnpm run test        # runs all backend route/service tests via tsx
```

The server listens on `PORT` and exposes its routes under `/api` (e.g. `/api/healthz`, `/api/analyze-contract`, `/api/analyze-financial-impact`, `/api/legal-search`, `/api/contract-search`, `/api/contract-chat`).

## Frontend setup and run commands

```bash
cd artifacts/misnad
PORT=5173 BASE_PATH=/ pnpm run dev
```

The frontend dev server proxies `/api` requests to `http://localhost:3000` (hardcoded in `vite.config.ts`), so run the backend on port `3000` for the proxy to work in development.

Other frontend scripts:

```bash
pnpm run build       # vite build
pnpm run serve       # vite preview (serves the production build)
pnpm run typecheck   # tsc --noEmit
```

## Testing commands

Each package has its own scripts; there is no single "test everything" script at the repository root, so run them per package:

```bash
# Backend route/service tests
cd artifacts/api-server && pnpm run test

# Frontend pure-logic tests
cd artifacts/misnad && pnpm run test

# Frontend component tests (Vitest + React Testing Library)
cd artifacts/misnad && pnpm run test:components

# Any lib/* package, e.g.:
cd lib/contract-analysis && pnpm run test
cd lib/financial-metrics && pnpm run test
cd lib/gemini-key-pool && pnpm run test
```

Repository-wide typecheck (uses TypeScript project references for `lib/*`, then each `artifacts/*`/`scripts` package):

```bash
pnpm run typecheck
```

## Privacy and security

- **PII masking before AI calls** — names, national IDs, Iqama numbers, commercial registration numbers, phone numbers, emails, IBANs, and bank account numbers are masked in the contract text before it is ever sent to Gemini or OpenRouter.
- **No secrets committed** — `.gitignore` excludes `.env` and `.env.*` while explicitly keeping `.env.example` trackable (`!.env.example`), so real API keys and database credentials are never meant to be committed.
- **Contract RAG data is session-scoped and masked-only** — only already-masked contract text is chunked/embedded/indexed for retrieval; sessions are time-limited (`CONTRACT_RAG_TTL_MINUTES`) with a cleanup path (`scripts/cleanup-contract-rag`).
- **Diagnostics never log secrets** — the Gemini key pool's diagnostic logging is restricted to safe, synthetic key identifiers (e.g. `gemini_key_1`) and never logs a raw API key value.

Despite these measures, this is a project-stage codebase and has not undergone a formal third-party security audit — see [Current limitations](#current-limitations).

## Current limitations

- No user authentication, accounts, or multi-tenant access control exist in this codebase — the API is currently open to any caller.
- No automated rate limiting or abuse protection is implemented at the API layer beyond the AI providers' own limits.
- The generated OpenAPI spec (`@workspace/api-spec`) and generated API client (`@workspace/api-client-react`) currently only cover the `/healthz` endpoint and are not yet wired into the frontend, which talks to the backend via direct `fetch` calls.
- OCR accuracy for heavily degraded scans, non-standard fonts, or unusual layouts is not guaranteed.
- The financial-metrics engine and AI-assisted understanding are tuned around the contract types listed above; other contract types are handled only via the generic `other` category with reduced structure.
- Legal RAG's regulatory source collection is a curated subset of Saudi sources (SAMA, Civil Transactions Law, Labor Law, lease/Ejar regulation, Insurance Authority regulation) — it is not an exhaustive legal database.
- `artifacts/mockup-sandbox` is a separate design/UI exploration workspace and is not part of the production application flow.

## Future work

- Wire the generated OpenAPI client (`@workspace/api-client-react`) into the frontend and expand the OpenAPI spec to cover the full API surface.
- Add authentication/authorization and per-user rate limiting.
- Expand the Legal RAG source collection and contract-type coverage.
- Independent security review of PII masking coverage and AI-provider data handling.

## Disclaimer

**Misnad is an informational tool and does not replace professional legal or financial advice.** Its AI-assisted analysis, personalized financial insights, and chat answers are generated automatically and may be incomplete, out of date, or mistaken. Financial figures are computed deterministically from the extracted contract data, but the underlying extraction (including OCR) is not guaranteed to be perfect. Always consult a qualified lawyer or licensed financial advisor before making a decision based on a contract, and verify any figure or clause interpretation against the original contract document.

## Team members

- Ahmed Alhabshi
- Mohammed Alhabshi
- Mohammed Alaidaroos
