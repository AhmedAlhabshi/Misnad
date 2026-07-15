import assert from "node:assert/strict";
import { FakeEmbeddingProvider } from "../embeddings/fakeEmbeddingProvider";
import { ingestSource } from "../ingestion/orchestrate";
import { LEGAL_SOURCE_MANIFEST } from "../manifest";
import { InMemoryLegalChunkRepository } from "../retrieval/inMemoryRepository";
import { retrieveLegalContext } from "../retrieval/service";

/**
 * End-to-end proof against the REAL curated SAMA sources (the actual
 * `legal-sources/sama/*.txt` files, chunked and embedded exactly as
 * production ingestion would) — the exact 3 topics the phase brief requires:
 * fees, APR, and early settlement. Uses `FakeEmbeddingProvider` (no live
 * Gemini call) and `InMemoryLegalChunkRepository` (no live database), per
 * the phase's database-blocker fallback instructions.
 */
export async function run(): Promise<void> {
  const repository = new InMemoryLegalChunkRepository();
  // A higher dimension than the package default keeps feature-hashing collisions rare
  // enough, against this small 4-chunk corpus, that a genuinely unrelated query doesn't
  // register a false-positive similarity purely from hash-bucket reuse.
  const embeddingProvider = new FakeEmbeddingProvider(512);

  await ingestSource("sama_regulations_consumer_financing", { repository, embeddingProvider, manifest: LEGAL_SOURCE_MANIFEST });
  await ingestSource("sama_apr_calculation_rules", { repository, embeddingProvider, manifest: LEGAL_SOURCE_MANIFEST });

  // --- Fees: "what is the maximum administrative fee" must surface Article 9 ---
  {
    const response = await retrieveLegalContext(
      { query: "What is the maximum administrative fee a creditor can charge?", contractType: "auto_finance" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    const hit = response.results.find((r) => r.articleNumber === "Article 9");
    assert.ok(hit, "Article 9 (Fees and Charges) must be among the results for a fees question");
    assert.equal(hit?.authority, "sama");
    assert.equal(hit?.documentTitle, "Regulations for Consumer Financing");
    assert.equal(hit?.officialSourceUrl, "https://rulebook.sama.gov.sa/en/regulations-consumer-financing");
    assert.ok(hit!.excerpt.includes("1%") || hit!.excerpt.toLowerCase().includes("administrative"), "the excerpt must be the real article text, not a fabricated summary");
  }
  console.log("PASS a fees question surfaces the real Article 9 (Fees and Charges) chunk with correct citation metadata");

  // --- APR: "APR calculation method" must surface Article 6 of the APR rules ---
  {
    const response = await retrieveLegalContext(
      { query: "How is the APR calculated? Net present value method.", contractType: "auto_finance", topics: ["apr"] },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    const hit = response.results.find((r) => r.articleNumber === "Article 6");
    assert.ok(hit, "Article 6 (APR Calculation Method) must be among the results for an APR question");
    assert.equal(hit?.documentTitle, "Rules Governing Calculation of Annual Percentage Rate (APR)");
    assert.equal(hit?.officialSourceUrl, "https://rulebook.sama.gov.sa/en/rules-governing-calculation-annual-percentage-rate-apr-0");
  }
  console.log("PASS an APR question surfaces the real Article 6 (APR Calculation Method) chunk with correct citation metadata");

  // --- Early settlement: "prepayment / early settlement" must surface Article 11 ---
  {
    const response = await retrieveLegalContext(
      { query: "Can I prepay my financing early without penalty? Early settlement rules.", contractType: "auto_finance", topics: ["early_settlement"] },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    const hit = response.results.find((r) => r.articleNumber === "Article 11");
    assert.ok(hit, "Article 11 (Early Payments) must be among the results for an early-settlement question");
    assert.equal(hit?.documentTitle, "Regulations for Consumer Financing");
  }
  console.log("PASS an early-settlement question surfaces the real Article 11 (Early Payments) chunk with correct citation metadata");

  // --- An exact article-number query ("Article 9") must rank that article first ---
  {
    const response = await retrieveLegalContext(
      { query: "Article 9", contractType: "auto_finance" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    assert.equal(response.results[0]?.articleNumber, "Article 9", "an explicit 'Article 9' query must rank that exact article first");
  }
  console.log("PASS an exact article-number query ranks that article first");

  // --- A genuinely unrelated question (outside this V1 SAMA collection's real content) returns insufficient_source ---
  {
    const response = await retrieveLegalContext(
      { query: "Ancient Egyptian pyramid construction techniques and desert irrigation methods", contractType: "auto_finance" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "insufficient_source", "a genuinely unrelated question must never be forced to match a weak, unrelated source");
    assert.deepEqual(response.results, []);
  }
  console.log("PASS a genuinely unrelated question returns insufficient_source rather than a weak forced match");

  console.log("PASS retrieval.samaFixtures.test.ts");
}

run();
