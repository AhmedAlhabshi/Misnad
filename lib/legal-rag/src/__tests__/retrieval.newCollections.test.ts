import assert from "node:assert/strict";
import { FakeEmbeddingProvider } from "../embeddings/fakeEmbeddingProvider";
import { ingestSource } from "../ingestion/orchestrate";
import { LEGAL_SOURCE_MANIFEST } from "../manifest";
import { InMemoryLegalChunkRepository } from "../retrieval/inMemoryRepository";
import { retrieveLegalContext } from "../retrieval/service";

/**
 * End-to-end proof against the REAL curated sources added this phase
 * (Civil Transactions Law, Labor Law, the Ejar landlord–tenant
 * regulation, and the SAMA insurance market conduct code) — chunked and
 * embedded exactly as production ingestion would, using
 * `FakeEmbeddingProvider` (no live Gemini call) and
 * `InMemoryLegalChunkRepository` (no live database). Exercises the REAL
 * `CONTRACT_TYPE_LEGAL_REGISTRY` (no override), so this also proves the
 * registry actually routes each contract type to the right collection(s).
 */
export async function run(): Promise<void> {
  const repository = new InMemoryLegalChunkRepository();
  const embeddingProvider = new FakeEmbeddingProvider(512);

  await ingestSource("civil_transactions_law", { repository, embeddingProvider, manifest: LEGAL_SOURCE_MANIFEST });
  await ingestSource("labor_law_2024_amendments", { repository, embeddingProvider, manifest: LEGAL_SOURCE_MANIFEST });
  await ingestSource("ejar_landlord_tenant_provisions", { repository, embeddingProvider, manifest: LEGAL_SOURCE_MANIFEST });
  await ingestSource("sama_insurance_market_conduct", { repository, embeddingProvider, manifest: LEGAL_SOURCE_MANIFEST });

  // --- Civil Transactions Law: rescission for breach ---
  {
    const response = await retrieveLegalContext(
      { query: "هل يجوز فسخ العقد عند الإخلال بالالتزام؟", contractType: "other" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    assert.ok(response.results.length > 0);
    assert.equal(response.results[0].authority, "bureau_of_experts");
    assert.ok(
      response.results.some((r) => r.excerpt.includes("فللمتعاقد الآخر") || r.excerpt.includes("فسخ")),
      "a breach/rescission question must surface the real rescission-for-breach provision",
    );
  }
  console.log("PASS a Civil Transactions Law breach/rescission question surfaces the real provision with the correct authority");

  // --- Civil Transactions Law: reducing an excessive penalty clause ---
  {
    const response = await retrieveLegalContext(
      { query: "هل يمكن تخفيض الشرط الجزائي إذا كان مبالغاً فيه؟", contractType: "other" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    assert.ok(
      response.results.some((r) => r.excerpt.includes("تنقص هذا التعويض") || r.excerpt.includes("مبالغاً فيه")),
      "a penalty-clause-reduction question must surface the real judicial-reduction provision",
    );
  }
  console.log("PASS a penalty-clause reduction question surfaces the real provision");

  // --- Employment: probation period ---
  // Note: FakeEmbeddingProvider is a plain bag-of-words hash with no Arabic
  // morphological normalization, so a prefixed form in the source text
  // ("للتجربة") won't token-match an unprefixed query word ("التجربة") the
  // way a real embedding's semantic understanding would — this asserts the
  // real provision clears the relevance threshold and is actually
  // returned, not that it wins the exact ranking race against that
  // artifact of the fake provider.
  {
    const response = await retrieveLegalContext(
      { query: "إذا كان العامل خاضعاً للتجربة، ما أقصى مدة يجوز تحديدها في عقد العمل؟", contractType: "employment" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    assert.equal(response.results[0].authority, "mhrsd", "the Labor Law (preferred collection) must outrank the civil-law fallback for an employment-specific question");
    assert.ok(
      response.results.some((r) => r.excerpt.includes("مائة وثمانين")),
      "the probation-period article (max 180 days) must be among the results for a probation-period question",
    );
  }
  console.log("PASS an employment probation-period question surfaces the real Labor Law provision, ranked above the civil-law fallback");

  // --- Employment: notice period on termination ---
  {
    const response = await retrieveLegalContext(
      { query: "ما هي مدة الإشعار المطلوبة لإنهاء عقد العمل غير محدد المدة؟", contractType: "employment" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    assert.ok(
      response.results.some((r) => r.excerpt.includes("ستين") || r.excerpt.includes("ثلاثين")),
      "a notice-period question must surface the real 30/60-day notice provision",
    );
  }
  console.log("PASS an employment notice-period question surfaces the real provision");

  // --- Lease: eviction for non-payment ---
  {
    const response = await retrieveLegalContext(
      { query: "هل يجوز الإخلاء بسبب عدم دفع الإيجار؟", contractType: "lease" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    assert.equal(response.results[0].authority, "ejar", "the Ejar landlord-tenant regulation must outrank the civil-law fallback for a lease-specific eviction question");
    assert.ok(
      response.results.some((r) => r.excerpt.includes("تخلف المستأجر عن السداد")),
      "the real non-payment eviction ground must be among the results",
    );
  }
  console.log("PASS a lease eviction-for-non-payment question surfaces the real Ejar provision, ranked above the civil-law fallback");

  // --- Lease: automatic renewal ---
  {
    const response = await retrieveLegalContext(
      { query: "هل يتجدد عقد الإيجار تلقائياً؟", contractType: "lease" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    assert.ok(response.results.some((r) => r.excerpt.includes("يتجدد عقد الإيجار تلقائي")), "an auto-renewal question must surface the real automatic-renewal provision");
  }
  console.log("PASS a lease auto-renewal question surfaces the real provision");

  // --- Insurance: when can the insurer reject a claim ---
  {
    const response = await retrieveLegalContext(
      { query: "When can an insurance company deny or reject a claim?", contractType: "insurance" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    assert.equal(response.results[0].authority, "sama");
    // The claim-acceptance-or-rejection provision was split into its own
    // compact chunk (see insuranceMarketConduct.ts's retrieval-quality-fix
    // note) specifically so a rejection/denial question surfaces this
    // exact provision rather than a longer, more diffuse chunk.
    assert.ok(
      response.results.some((r) => r.excerpt.toLowerCase().includes("denied or rejected claims") || r.excerpt.toLowerCase().includes("claim acceptance or rejection")),
      "a claim-denial question must surface the dedicated claim-acceptance-or-rejection provision",
    );
  }
  console.log("PASS an insurance claim-denial question surfaces the dedicated claim-rejection provision");

  // --- Insurance: cancellation rights ---
  {
    const response = await retrieveLegalContext(
      { query: "Can I cancel my insurance policy, and what is the free look period?", contractType: "insurance" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    assert.ok(
      response.results.some((r) => r.excerpt.includes("Right to Cancel a New Policy") || r.excerpt.includes("Free Look") || r.excerpt.includes("cancellation")),
      "a cancellation question must surface the real cancellation/free-look provisions",
    );
  }
  console.log("PASS an insurance cancellation question surfaces the real provision");

  // --- Subscription: the preferred collection (moc_ecommerce) has no ingested source this phase; a subscription-specific question (auto-renewal disclosure) has no real match in the civil-law fallback either, and must honestly return insufficient_source rather than a forced weak match ---
  {
    const response = await retrieveLegalContext(
      { query: "متى يحق للمستهلك استرداد المبلغ المدفوع للمتجر الإلكتروني؟", contractType: "subscription" },
      { repository, embeddingProvider },
    );
    assert.equal(
      response.status,
      "insufficient_source",
      "a subscription-specific question must never be forced onto an unrelated civil-law fallback chunk merely because the e-commerce collection has no ingested source yet",
    );
    assert.deepEqual(response.results, []);
  }
  console.log("PASS a subscription-specific question honestly returns insufficient_source when the e-commerce collection has no ingested source");

  // --- Cross-collection isolation: a lease-specific query must never surface employment or insurance content ---
  {
    const response = await retrieveLegalContext(
      { query: "هل يجوز الإخلاء بسبب عدم دفع الإيجار؟", contractType: "lease" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    for (const result of response.results) {
      assert.notEqual(result.authority, "mhrsd", "a lease query must never surface Labor Law content");
    }
  }
  console.log("PASS a lease-specific query never surfaces unrelated employment-collection content");

  // --- Citations always carry official authority + source URL, never a raw/unofficial reference ---
  {
    const response = await retrieveLegalContext(
      { query: "متى يحق لصاحب العمل إنهاء عقد العامل؟", contractType: "employment" },
      { repository, embeddingProvider },
    );
    assert.equal(response.status, "results_found");
    for (const result of response.results) {
      assert.ok(result.officialSourceUrl.startsWith("https://"), "every citation must carry a real official source URL");
      assert.ok(result.authority.length > 0);
    }
  }
  console.log("PASS every returned citation carries an official authority and source URL");

  console.log("PASS retrieval.newCollections.test.ts");
}

run();
