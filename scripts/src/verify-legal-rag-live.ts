import {
  GeminiEmbeddingProvider,
  PostgresLegalChunkRepository,
  retrieveLegalContext,
  type LegalSearchQuery,
} from "@workspace/legal-rag";
import type { ContractType } from "@workspace/contract-types";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

interface LiveCheck {
  collectionLabel: string;
  query: string;
  contractType: ContractType;
  /** A short, distinctive phrase expected somewhere in a passing result's excerpt — proves the real ingested chunk (not a coincidental weak match) was found. */
  expectPhrase: string;
}

/**
 * Bounded set of real retrieval checks — one or two per collection ingested
 * this phase, run against the REAL Neon database and REAL Gemini
 * embeddings. Does NOT ingest anything itself: run
 * `pnpm run ingest-legal-collection <collectionId>` (or
 * `ingest-legal-source` per source) first so the chunks this script
 * queries actually exist in the live database.
 *
 *   node --env-file=artifacts/api-server/.env --import tsx scripts/src/verify-legal-rag-live.ts
 *
 * Never prints a full legal document or full chunk text — only a short,
 * bounded excerpt per result, matching the existing retrieval API's own
 * excerpt bounds.
 */
const LIVE_CHECKS: LiveCheck[] = [
  {
    collectionLabel: "SAMA consumer financing (existing)",
    query: "What is the maximum administrative fee a creditor can charge?",
    contractType: "auto_finance",
    expectPhrase: "1%",
  },
  {
    collectionLabel: "civil_transactions",
    query: "هل يجوز فسخ العقد عند الإخلال بالالتزام؟",
    contractType: "other",
    expectPhrase: "فسخ",
  },
  {
    collectionLabel: "civil_transactions",
    query: "هل يمكن تخفيض الشرط الجزائي إذا كان مبالغاً فيه؟",
    contractType: "other",
    expectPhrase: "التعويض",
  },
  {
    collectionLabel: "labor_law",
    query: "إذا كان العامل خاضعاً للتجربة، ما أقصى مدة يجوز تحديدها في عقد العمل؟",
    contractType: "employment",
    expectPhrase: "مائة وثمانين",
  },
  {
    collectionLabel: "labor_law",
    query: "ما هي مدة الإشعار المطلوبة لإنهاء عقد العمل غير محدد المدة؟",
    contractType: "employment",
    expectPhrase: "ثلاثين",
  },
  {
    collectionLabel: "ejar",
    query: "هل يجوز الإخلاء بسبب عدم دفع الإيجار؟",
    contractType: "lease",
    expectPhrase: "الإيجار",
  },
  {
    collectionLabel: "ejar",
    query: "هل يتجدد عقد الإيجار تلقائياً؟",
    contractType: "lease",
    expectPhrase: "يتجدد",
  },
  {
    collectionLabel: "insurance_authority",
    query: "When can an insurance company deny or reject a claim?",
    contractType: "insurance",
    expectPhrase: "claim",
  },
  {
    collectionLabel: "insurance_authority",
    query: "Can I cancel my insurance policy, and what is the free look period?",
    contractType: "insurance",
    expectPhrase: "cancel",
  },
];

const MAX_REPORTED_EXCERPT_CHARS = 150;

async function main(): Promise<void> {
  const repository = new PostgresLegalChunkRepository();
  const embeddingProvider = new GeminiEmbeddingProvider();

  console.log(`Running ${LIVE_CHECKS.length} live retrieval checks against the real Neon database and real Gemini embeddings...`);
  console.log("");

  let passCount = 0;
  let failCount = 0;

  for (const check of LIVE_CHECKS) {
    const query: LegalSearchQuery = { query: check.query, contractType: check.contractType };
    try {
      const response = await retrieveLegalContext(query, { repository, embeddingProvider });
      const top = response.results[0];
      const passed =
        response.status === "results_found" &&
        top !== undefined &&
        top.excerpt.toLowerCase().includes(check.expectPhrase.toLowerCase());

      console.log(`[${passed ? "PASS" : "FAIL"}] collection=${check.collectionLabel}`);
      console.log(`  query: ${check.query}`);
      console.log(`  status: ${response.status}`);
      if (top) {
        console.log(`  sourceId/authority: ${top.authority}`);
        console.log(`  article/section: ${top.articleNumber ?? top.section ?? "(none)"}`);
        console.log(`  score: ${top.score}`);
        console.log(`  citation: ${top.officialSourceUrl}`);
        console.log(`  excerpt: ${top.excerpt.slice(0, MAX_REPORTED_EXCERPT_CHARS)}${top.excerpt.length > MAX_REPORTED_EXCERPT_CHARS ? "..." : ""}`);
      } else {
        console.log("  (no results)");
      }
      console.log("");

      if (passed) passCount += 1;
      else failCount += 1;
    } catch (error) {
      failCount += 1;
      console.log(`[FAIL] collection=${check.collectionLabel} — ${error instanceof Error ? error.message : String(error)}`);
      console.log("");
    }
  }

  console.log(`Done: ${passCount}/${LIVE_CHECKS.length} checks passed.`);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
