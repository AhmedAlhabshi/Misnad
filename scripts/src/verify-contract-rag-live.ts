import {
  indexContractSession,
  PostgresContractRagRepository,
  retrieveContractContext,
} from "@workspace/contract-rag";
import { GeminiEmbeddingProvider } from "@workspace/legal-rag";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    fail(message);
  }
}

/**
 * A synthetic, never-real-user fixture — invented facts and invented
 * placeholder tokens only, never an actual masked contract from a real
 * upload. Shaped like already-masked text (the pipeline's PII placeholders
 * appear verbatim) since indexing only ever accepts masked text.
 */
const SYNTHETIC_MASKED_CONTRACT_A = [
  "Section 1: Parties",
  "This is a synthetic test fixture for live Contract RAG verification only, involving no real person. The lessee is identified by [NATIONAL_ID] and [PHONE].",
  "",
  "Section 2: Monthly Rent",
  "The lessee shall pay a monthly rent of 3,300 SAR on the first business day of each month.",
  "",
  "Section 3: Early Termination",
  "Either party may terminate this synthetic test lease early with 45 days written notice and a termination fee of 750 SAR.",
].join("\n");

const SYNTHETIC_MASKED_CONTRACT_B = [
  "Section 1: Salary",
  "This is a second, unrelated synthetic test fixture for live Contract RAG verification only. The employee, identified by [NATIONAL_ID], receives a monthly salary of 9,000 SAR.",
].join("\n");

async function main(): Promise<void> {
  const repository = new PostgresContractRagRepository();
  const embeddingProvider = new GeminiEmbeddingProvider();

  console.log("Indexing synthetic session A (lease)...");
  const sessionA = await indexContractSession(
    { maskedDocument: { maskedText: SYNTHETIC_MASKED_CONTRACT_A }, contractType: "lease", analysisLanguage: "en" },
    { repository, embeddingProvider },
  );
  console.log(`OK: session A indexed (sessionId=${sessionA.sessionId}, chunks=${sessionA.chunkCount})`);

  console.log("Indexing synthetic session B (employment)...");
  const sessionB = await indexContractSession(
    { maskedDocument: { maskedText: SYNTHETIC_MASKED_CONTRACT_B }, contractType: "employment", analysisLanguage: "en" },
    { repository, embeddingProvider },
  );
  console.log(`OK: session B indexed (sessionId=${sessionB.sessionId}, chunks=${sessionB.chunkCount})`);

  try {
    console.log("Retrieving a known clause from session A...");
    const retrieval = await retrieveContractContext(
      { sessionId: sessionA.sessionId, query: "how much is the monthly rent", language: "en" },
      { repository, embeddingProvider },
    );
    assertCondition(retrieval.status === "results_found", `expected results_found, got "${retrieval.status}"`);
    assertCondition(retrieval.results.length > 0, "expected at least one result");
    assertCondition(
      retrieval.results.some((r) => r.section === "Section 2"),
      "expected the monthly-rent section to be among the retrieved results",
    );
    console.log("OK: known clause retrieved from session A");

    console.log("Proving session isolation (session B must never see session A's chunks)...");
    const crossSessionCheck = await retrieveContractContext(
      { sessionId: sessionB.sessionId, query: "how much is the monthly rent", language: "en" },
      { repository, embeddingProvider },
    );
    const leaked = crossSessionCheck.results.some((r) => r.excerpt.includes("3,300 SAR") || r.excerpt.includes("termination fee"));
    assertCondition(!leaked, "session isolation violated: session B's retrieval returned session A's content");
    console.log("OK: session isolation confirmed — session B never returns session A's chunks");

    console.log("Verifying an invalid/foreign session id is rejected...");
    const foreignCheck = await retrieveContractContext(
      { sessionId: sessionA.sessionId.slice(0, -1) + (sessionA.sessionId.endsWith("A") ? "B" : "A"), query: "anything", language: "en" },
      { repository, embeddingProvider },
    );
    assertCondition(
      foreignCheck.status === "session_unavailable" || foreignCheck.status === "insufficient_contract_context",
      `expected a safe non-leaking status for a foreign/malformed session id, got "${foreignCheck.status}"`,
    );
    console.log("OK: a foreign/tampered session id never returns another session's data");
  } finally {
    console.log("Deleting synthetic test sessions...");
    await repository.deleteSession(sessionA.sessionId);
    await repository.deleteSession(sessionB.sessionId);
    const remainingA = await repository.getActiveSession(sessionA.sessionId);
    const remainingB = await repository.getActiveSession(sessionB.sessionId);
    assertCondition(remainingA === null, "session A was not fully deleted");
    assertCondition(remainingB === null, "session B was not fully deleted");
    console.log("OK: both synthetic test sessions and their chunks were deleted — no residue left in the database");
  }

  console.log("PASS verify-contract-rag-live.ts — all live Neon + Gemini checks passed");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
