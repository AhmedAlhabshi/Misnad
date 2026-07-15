import assert from "node:assert/strict";
import { FakeEmbeddingProvider } from "../embeddings/fakeEmbeddingProvider";
import { cosineDistance } from "../retrieval/vectorMath";

export async function run(): Promise<void> {
  const provider = new FakeEmbeddingProvider(64);

  // --- Deterministic: same text always yields the same vector ---
  const [a1] = await provider.embed(["administrative fee of 1,200 SAR"], "document");
  const [a2] = await provider.embed(["administrative fee of 1,200 SAR"], "document");
  assert.deepEqual(a1, a2, "the same text must always embed to the exact same vector");
  console.log("PASS FakeEmbeddingProvider is deterministic for identical text");

  assert.equal(a1.length, 64, "the embedding must have exactly the declared dimension count");
  console.log("PASS FakeEmbeddingProvider returns vectors of the declared dimension");

  // --- Meaningful similarity: shared vocabulary scores closer than unrelated text ---
  const [feesQuery] = await provider.embed(["what is the maximum administrative fee"], "query");
  const [feesDoc] = await provider.embed(["administrative fee of 1,200 SAR must not exceed 1% of financing"], "document");
  const [unrelatedDoc] = await provider.embed(["probation period and annual leave entitlement for employees"], "document");

  const distanceToFees = cosineDistance(feesQuery, feesDoc);
  const distanceToUnrelated = cosineDistance(feesQuery, unrelatedDoc);
  assert.ok(
    distanceToFees < distanceToUnrelated,
    `a fee-related query must be closer to a fee-related document (${distanceToFees}) than to an unrelated one (${distanceToUnrelated})`,
  );
  console.log("PASS FakeEmbeddingProvider produces meaningfully closer vectors for shared vocabulary (real bag-of-words behavior, not random noise)");

  // --- Rejects empty input ---
  {
    let threw = false;
    try {
      await provider.embed([""], "document");
    } catch {
      threw = true;
    }
    assert.ok(threw, "embedding an empty string must throw");
  }
  console.log("PASS FakeEmbeddingProvider rejects empty input");

  // --- Rejects oversized input ---
  {
    let threw = false;
    try {
      await provider.embed(["a".repeat(10000)], "document");
    } catch {
      threw = true;
    }
    assert.ok(threw, "embedding text over MAX_EMBEDDING_INPUT_CHARS must throw");
  }
  console.log("PASS FakeEmbeddingProvider rejects oversized input");

  console.log("PASS embeddings.fakeProvider.test.ts");
}

run();
