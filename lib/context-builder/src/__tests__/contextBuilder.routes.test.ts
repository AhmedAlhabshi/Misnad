import assert from "node:assert/strict";
import { buildGroundedContext } from "../contextBuilder";
import { FULLY_AVAILABLE, buildRouteDecision, contractAnalysisFixture, financialMetricsFixture, setupContractRagFixture, setupLegalRagFixture } from "./testFixtures";

export async function run(): Promise<void> {
  const contractRagFixture = await setupContractRagFixture();
  const legalRagFixture = await setupLegalRagFixture();
  const contractRag = { repository: contractRagFixture.repository, embeddingProvider: contractRagFixture.embeddingProvider };
  const legalRag = { repository: legalRagFixture.repository, embeddingProvider: legalRagFixture.embeddingProvider };

  // --- general: retrieves nothing, stays valid ---
  {
    const routeDecision = buildRouteDecision("general", FULLY_AVAILABLE, "what is rag");
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "What is RAG?",
        contractRagSessionId: contractRagFixture.sessionId,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: contractAnalysisFixture(),
        financialMetrics: financialMetricsFixture(),
      },
      { contractRag, legalRag },
    );
    assert.equal(context.route, "general");
    assert.deepEqual(context.sourcesUsed, []);
    assert.deepEqual(context.contractEvidence, []);
    assert.deepEqual(context.legalEvidence, []);
    assert.deepEqual(context.financialFacts, []);
    assert.deepEqual(context.analysisFacts, []);
    assert.deepEqual(context.warnings, [], "a general route needs nothing, so it should produce no warnings either");
  }
  console.log("PASS general route retrieves nothing and stays a valid context with empty evidence arrays");

  // --- contract: retrieves only Contract RAG ---
  {
    const routeDecision = buildRouteDecision("contract", FULLY_AVAILABLE, "early termination");
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "What does my contract say about early termination?",
        contractRagSessionId: contractRagFixture.sessionId,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: contractAnalysisFixture(),
        financialMetrics: financialMetricsFixture(),
      },
      { contractRag, legalRag },
    );
    assert.equal(context.route, "contract");
    assert.deepEqual(context.sourcesUsed, ["contract"]);
    assert.ok(context.contractEvidence.length > 0);
    assert.deepEqual(context.legalEvidence, []);
    assert.deepEqual(context.financialFacts, []);
    assert.deepEqual(context.analysisFacts, [], "analysis facts are only gathered for the 'all' route");
  }
  console.log("PASS contract route retrieves only from Contract RAG");

  // --- legal: retrieves only Legal RAG ---
  {
    const routeDecision = buildRouteDecision("legal", FULLY_AVAILABLE, "maximum administrative fee");
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "What is the maximum administrative fee a creditor can charge?",
        contractRagSessionId: contractRagFixture.sessionId,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: contractAnalysisFixture(),
        financialMetrics: financialMetricsFixture(),
      },
      { contractRag, legalRag },
    );
    assert.equal(context.route, "legal");
    assert.deepEqual(context.sourcesUsed, ["legal"]);
    assert.equal(context.contractEvidence.length, 0);
    assert.ok(context.legalEvidence.length > 0);
    assert.equal(context.financialFacts.length, 0);
  }
  console.log("PASS legal route retrieves only from Legal RAG");

  // --- financial: retrieves only deterministic financial facts ---
  {
    const routeDecision = buildRouteDecision("financial", FULLY_AVAILABLE, "how much every month");
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "How much will I pay every month?",
        contractRagSessionId: contractRagFixture.sessionId,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: contractAnalysisFixture(),
        financialMetrics: financialMetricsFixture(),
      },
      { contractRag, legalRag },
    );
    assert.equal(context.route, "financial");
    assert.deepEqual(context.sourcesUsed, ["financial"]);
    assert.equal(context.contractEvidence.length, 0);
    assert.equal(context.legalEvidence.length, 0);
    assert.ok(context.financialFacts.length > 0);
    assert.ok(context.financialFacts.some((f) => f.factKey === "monthly_payment"));
  }
  console.log("PASS financial route retrieves only deterministic financial facts");

  // --- contract_and_legal: retrieves from both ---
  {
    const routeDecision = buildRouteDecision("contract_and_legal", FULLY_AVAILABLE, "is this fee allowed under saudi regulations");
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "Is this administrative fee allowed under Saudi regulations?",
        contractRagSessionId: contractRagFixture.sessionId,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: contractAnalysisFixture(),
        financialMetrics: financialMetricsFixture(),
      },
      { contractRag, legalRag },
    );
    assert.equal(context.route, "contract_and_legal");
    assert.deepEqual([...context.sourcesUsed].sort(), ["contract", "legal"]);
    assert.ok(context.contractEvidence.length > 0);
    assert.ok(context.legalEvidence.length > 0);
    assert.equal(context.financialFacts.length, 0);
    assert.equal(context.analysisFacts.length, 0);
  }
  console.log("PASS contract_and_legal route retrieves from both Contract RAG and Legal RAG");

  // --- contract_and_financial: retrieves contract evidence + financial facts ---
  {
    const routeDecision = buildRouteDecision("contract_and_financial", FULLY_AVAILABLE, "total cost per contract");
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "According to my contract's monthly installment and administrative fee, what is my total cost?",
        contractRagSessionId: contractRagFixture.sessionId,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: contractAnalysisFixture(),
        financialMetrics: financialMetricsFixture(),
      },
      { contractRag, legalRag },
    );
    assert.equal(context.route, "contract_and_financial");
    assert.deepEqual([...context.sourcesUsed].sort(), ["contract", "financial"]);
    assert.ok(context.contractEvidence.length > 0);
    assert.equal(context.legalEvidence.length, 0);
    assert.ok(context.financialFacts.length > 0);
    assert.equal(context.analysisFacts.length, 0);
  }
  console.log("PASS contract_and_financial route retrieves contract evidence and financial facts, never legal");

  // --- all: retrieves contract, legal, financial, AND the contract-analysis summary ---
  {
    const routeDecision = buildRouteDecision("all", FULLY_AVAILABLE, "is this fee allowed and what is my total cost");
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
      { contractRag, legalRag },
    );
    assert.equal(context.route, "all");
    assert.deepEqual([...context.sourcesUsed].sort(), ["contract", "financial", "legal"]);
    assert.ok(context.contractEvidence.length > 0);
    assert.ok(context.legalEvidence.length > 0);
    assert.ok(context.financialFacts.length > 0);
    assert.ok(context.analysisFacts.length > 0, "the 'all' route must also include the contract-analysis summary");
    assert.ok(context.analysisFacts.some((f) => f.factKey === "contract_summary"));
  }
  console.log("PASS all route retrieves Contract RAG, Legal RAG, financial facts, and the contract-analysis summary");

  console.log("PASS contextBuilder.routes.test.ts");
}

run();
