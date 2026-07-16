import assert from "node:assert/strict";
import { enforceTokenBudget, estimateTextTokens } from "../budget";
import type { ContractEvidenceItem, LegalEvidenceItem } from "../schema";

function contractItem(chunkId: string, excerpt: string, relevanceScore: number): ContractEvidenceItem {
  return { source: "contract", authority: "user_contract", citation: `Your contract — ${chunkId}`, relevanceScore, excerpt, chunkId, section: null, chunkOrder: 0 };
}

function legalItem(chunkId: string, excerpt: string, relevanceScore: number): LegalEvidenceItem {
  return {
    source: "legal",
    authority: "sama",
    citation: "https://example.gov.sa/doc",
    relevanceScore,
    excerpt,
    chunkId,
    documentTitle: "Test Regulation",
    articleNumber: null,
    section: null,
  };
}

export async function run(): Promise<void> {
  // --- Token estimate is a deterministic function of text length ---
  {
    assert.equal(estimateTextTokens(""), 0);
    assert.equal(estimateTextTokens("abcd"), 1);
    assert.equal(estimateTextTokens("abcdefgh"), 2);
  }
  console.log("PASS estimateTextTokens is a deterministic character-length heuristic");

  // --- No trimming needed when under budget ---
  {
    const pools = {
      contractEvidence: [contractItem("c1", "short excerpt", 0.9)],
      legalEvidence: [],
      financialFacts: [],
      analysisFacts: [],
    };
    const result = enforceTokenBudget(pools, 4000);
    assert.equal(result.trimmed, false);
    assert.equal(result.pools.contractEvidence.length, 1);
  }
  console.log("PASS no trimming occurs when total evidence fits the token budget");

  // --- Trimming removes the lowest-ranked item first, across pools ---
  {
    const longExcerpt = "x".repeat(2000);
    const pools = {
      contractEvidence: [contractItem("c1", longExcerpt, 0.9), contractItem("c2", longExcerpt, 0.2)],
      legalEvidence: [legalItem("l1", longExcerpt, 0.95)],
      financialFacts: [],
      analysisFacts: [],
    };
    const result = enforceTokenBudget(pools, 600);
    assert.equal(result.trimmed, true);
    const remainingIds = [...result.pools.contractEvidence.map((i) => i.chunkId), ...result.pools.legalEvidence.map((i) => i.chunkId)];
    assert.ok(!remainingIds.includes("c2"), "the lowest-relevance item across all pools must be trimmed first");
    assert.ok(remainingIds.includes("l1"), "the highest-relevance item must survive trimming");
  }
  console.log("PASS budget trimming removes the globally lowest-ranked evidence item first");

  // --- Never removes all evidence, even far over budget ---
  {
    const hugeExcerpt = "y".repeat(50_000);
    const pools = {
      contractEvidence: [contractItem("only-one", hugeExcerpt, 0.5)],
      legalEvidence: [],
      financialFacts: [],
      analysisFacts: [],
    };
    const result = enforceTokenBudget(pools, 10);
    assert.equal(result.pools.contractEvidence.length, 1, "the last remaining evidence item must never be removed");
    assert.ok(result.tokenEstimate > 10, "tokenEstimate may legitimately exceed the budget when only one item remains");
  }
  console.log("PASS the token budget never trims down to zero evidence, even when a single item exceeds it");

  console.log("PASS budget.test.ts");
}

run();
