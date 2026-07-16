import assert from "node:assert/strict";
import { buildGroundedContext } from "../contextBuilder";
import { FULLY_AVAILABLE, buildRouteDecision, contractAnalysisFixture, financialMetricsFixture, setupContractRagFixture, setupLegalRagFixture } from "./testFixtures";

export async function run(): Promise<void> {
  const contractRagFixture = await setupContractRagFixture();
  const legalRagFixture = await setupLegalRagFixture();
  const contractRag = { repository: contractRagFixture.repository, embeddingProvider: contractRagFixture.embeddingProvider };
  const legalRag = { repository: legalRagFixture.repository, embeddingProvider: legalRagFixture.embeddingProvider };

  // --- Configurable per-source limits are actually enforced end-to-end ---
  {
    const routeDecision = buildRouteDecision("all", FULLY_AVAILABLE, "is this fee allowed and total cost");
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "Is this administrative fee allowed under Saudi regulations, and what is my total cost?",
        contractRagSessionId: contractRagFixture.sessionId,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: contractAnalysisFixture(),
        financialMetrics: financialMetricsFixture(),
      },
      { contractRag, legalRag, rankingLimits: { maxContractEvidence: 1, maxLegalEvidence: 1, maxFinancialFacts: 2, maxAnalysisFacts: 1 } },
    );
    assert.ok(context.contractEvidence.length <= 1);
    assert.ok(context.legalEvidence.length <= 1);
    assert.ok(context.financialFacts.length <= 2);
    assert.ok(context.analysisFacts.length <= 1);
  }
  console.log("PASS configurable per-source ranking limits (maxContractEvidence, maxLegalEvidence, maxFinancialFacts, maxAnalysisFacts) are enforced end-to-end");

  // --- Financial facts are ranked: with a limit of 1, the single surviving fact is the highest-relevance one (monthly payment) ---
  {
    const routeDecision = buildRouteDecision("financial", FULLY_AVAILABLE, "how much every month");
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "How much will I pay every month?",
        contractRagSessionId: null,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: null,
        financialMetrics: financialMetricsFixture(),
      },
      { rankingLimits: { maxFinancialFacts: 1 } },
    );
    assert.equal(context.financialFacts.length, 1);
    assert.equal(context.financialFacts[0].factKey, "monthly_payment", "the single highest-relevance financial fact must survive a limit of 1");
  }
  console.log("PASS financial facts are ranked by relevance — the highest-priority fact survives a tight limit");

  // --- A very small token budget forces trimming but never removes every evidence item ---
  {
    const routeDecision = buildRouteDecision("all", FULLY_AVAILABLE, "is this fee allowed and total cost");
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "Is this administrative fee allowed under Saudi regulations, and what is my total cost?",
        contractRagSessionId: contractRagFixture.sessionId,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: contractAnalysisFixture(),
        financialMetrics: financialMetricsFixture(),
      },
      { contractRag, legalRag, maxTokenBudget: 30 },
    );
    const totalEvidence = context.contractEvidence.length + context.legalEvidence.length + context.financialFacts.length + context.analysisFacts.length;
    assert.ok(totalEvidence >= 1, "budget trimming must never remove every piece of evidence");
    assert.ok(context.warnings.some((w) => w.includes("evidence_trimmed_for_token_budget")));
  }
  console.log("PASS an unreasonably small token budget trims evidence but never removes all of it, and is reported in warnings");

  console.log("PASS contextBuilder.rankingAndBudget.test.ts");
}

run();
