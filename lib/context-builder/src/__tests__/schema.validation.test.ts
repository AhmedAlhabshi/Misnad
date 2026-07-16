import assert from "node:assert/strict";
import { contractEvidenceItemSchema, financialFactItemSchema, groundedContextSchema, legalEvidenceItemSchema } from "../schema";
import { buildGroundedContext } from "../contextBuilder";
import { FULLY_AVAILABLE, buildRouteDecision, financialMetricsFixture } from "./testFixtures";

export async function run(): Promise<void> {
  // --- A well-formed GroundedContext parses ---
  {
    const parsed = groundedContextSchema.parse({
      route: "financial",
      question: "How much will I pay every month?",
      language: "en",
      contractType: "auto_finance",
      sourcesUsed: ["financial"],
      contractEvidence: [],
      legalEvidence: [],
      financialFacts: [
        { source: "financial", authority: "financial_metrics_engine", citation: "financialMetrics.recurringCommitment", relevanceScore: 1, excerpt: "Monthly payment: 2,400.00 SAR", factKey: "monthly_payment", label: "Monthly payment" },
      ],
      analysisFacts: [],
      tokenEstimate: 70,
      warnings: [],
    });
    assert.equal(parsed.route, "financial");
  }
  console.log("PASS a well-formed GroundedContext parses");

  // --- relevanceScore outside [0, 1] is rejected ---
  {
    assert.throws(() =>
      financialFactItemSchema.parse({
        source: "financial",
        authority: "financial_metrics_engine",
        citation: "financialMetrics.x",
        relevanceScore: 1.5,
        excerpt: "test",
        factKey: "x",
        label: "X",
      }),
    );
  }
  console.log("PASS a relevanceScore outside [0, 1] is rejected");

  // --- Every evidence item type requires authority, citation, relevanceScore, and excerpt ---
  {
    assert.throws(() =>
      contractEvidenceItemSchema.parse({ source: "contract", citation: "Your contract", relevanceScore: 0.5, excerpt: "text", chunkId: "c1", section: null, chunkOrder: 0 }),
    );
    assert.throws(() =>
      legalEvidenceItemSchema.parse({ source: "legal", authority: "sama", relevanceScore: 0.5, excerpt: "text", chunkId: "l1", documentTitle: "Doc", articleNumber: null, section: null }),
    );
  }
  console.log("PASS every evidence item schema requires authority, citation, relevanceScore, and excerpt");

  // --- An empty authority or citation string is rejected (never a silently-blank attribution) ---
  {
    assert.throws(() =>
      financialFactItemSchema.parse({ source: "financial", authority: "", citation: "financialMetrics.x", relevanceScore: 0.5, excerpt: "test", factKey: "x", label: "X" }),
    );
  }
  console.log("PASS an empty authority string is rejected");

  // --- The real orchestrator's output always validates against groundedContextSchema ---
  {
    const routeDecision = buildRouteDecision("financial", FULLY_AVAILABLE, "how much every month");
    const context = await buildGroundedContext({
      routeDecision,
      question: "How much will I pay every month?",
      contractRagSessionId: null,
      contractType: "auto_finance",
      answerLanguage: "en",
      contractAnalysis: null,
      financialMetrics: financialMetricsFixture(),
    });
    const revalidated = groundedContextSchema.parse(context);
    assert.equal(revalidated.route, "financial");
    assert.ok(Array.isArray(revalidated.financialFacts));
    assert.ok(revalidated.tokenEstimate >= 0);
    assert.ok(Array.isArray(revalidated.warnings));
  }
  console.log("PASS buildGroundedContext's real output always validates against groundedContextSchema");

  console.log("PASS schema.validation.test.ts");
}

run();
