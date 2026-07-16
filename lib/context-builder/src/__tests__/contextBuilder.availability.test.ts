import assert from "node:assert/strict";
import { buildGroundedContext } from "../contextBuilder";
import { buildRouteDecision, contractAnalysisFixture, financialMetricsFixture, setupContractRagFixture, setupLegalRagFixture } from "./testFixtures";

export async function run(): Promise<void> {
  const contractRagFixture = await setupContractRagFixture();
  const legalRagFixture = await setupLegalRagFixture();
  const contractRag = { repository: contractRagFixture.repository, embeddingProvider: contractRagFixture.embeddingProvider };
  const legalRag = { repository: legalRagFixture.repository, embeddingProvider: legalRagFixture.embeddingProvider };

  // --- Contract RAG unavailable: route preserved, contractEvidence empty, warning explicit ---
  {
    const routeDecision = buildRouteDecision(
      "contract",
      { contractRagAvailable: false, legalRagAvailable: true, financialMetricsAvailable: true },
      "early termination",
    );
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "What does my contract say about early termination?",
        contractRagSessionId: contractRagFixture.sessionId,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: null,
        financialMetrics: null,
      },
      { contractRag, legalRag },
    );
    assert.equal(context.route, "contract", "route must never change, even when the required source is unavailable");
    assert.deepEqual(context.sourcesUsed, []);
    assert.deepEqual(context.contractEvidence, []);
    assert.ok(context.warnings.some((w) => w.includes("source_unavailable:contract")));
  }
  console.log("PASS Contract RAG unavailable: route preserved, no contract evidence, explicit warning");

  // --- Legal RAG unavailable during a legal-comparison route: never silently downgraded ---
  {
    const routeDecision = buildRouteDecision(
      "contract_and_legal",
      { contractRagAvailable: true, legalRagAvailable: false, financialMetricsAvailable: true },
      "is this fee allowed",
    );
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "Is this administrative fee allowed under Saudi regulations?",
        contractRagSessionId: contractRagFixture.sessionId,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: null,
        financialMetrics: null,
      },
      { contractRag, legalRag },
    );
    assert.equal(context.route, "contract_and_legal", "a legal-comparison route must never be downgraded to general");
    assert.deepEqual(context.sourcesUsed, ["contract"]);
    assert.ok(context.contractEvidence.length > 0, "the still-available contract source must still be queried");
    assert.deepEqual(context.legalEvidence, []);
    assert.ok(context.warnings.some((w) => w.includes("source_unavailable:legal")));
  }
  console.log("PASS Legal RAG unavailable: contract_and_legal route preserved, contract evidence still gathered, legal explicitly flagged unavailable");

  // --- Financial metrics unavailable: route preserved, financialFacts empty, warning explicit ---
  {
    const routeDecision = buildRouteDecision(
      "financial",
      { contractRagAvailable: true, legalRagAvailable: true, financialMetricsAvailable: false },
      "how much every month",
    );
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "How much will I pay every month?",
        contractRagSessionId: contractRagFixture.sessionId,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: null,
        financialMetrics: financialMetricsFixture(),
      },
      { contractRag, legalRag },
    );
    assert.equal(context.route, "financial");
    assert.deepEqual(context.sourcesUsed, []);
    assert.deepEqual(context.financialFacts, [], "financial facts must stay empty when the router marked financial metrics unavailable, even though a real object was passed");
    assert.ok(context.warnings.some((w) => w.includes("source_unavailable:financial")));
  }
  console.log("PASS financial metrics unavailable: route preserved, no financial facts extracted, explicit warning");

  // --- No contractRagSessionId at all, even though the route requires contract evidence ---
  {
    const routeDecision = buildRouteDecision("contract", { contractRagAvailable: true, legalRagAvailable: true, financialMetricsAvailable: true }, "early termination");
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "What does my contract say about early termination?",
        contractRagSessionId: null,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: null,
        financialMetrics: null,
      },
      { contractRag, legalRag },
    );
    assert.equal(context.route, "contract");
    assert.deepEqual(context.contractEvidence, []);
    assert.ok(context.warnings.some((w) => w.includes("no contractRagSessionId")));
  }
  console.log("PASS a missing contractRagSessionId produces empty contract evidence with an explicit warning, never a throw");

  // --- No financialMetrics / contractAnalysis objects provided at all (deps not the issue — the data itself is null) ---
  {
    const routeDecision = buildRouteDecision("all", { contractRagAvailable: true, legalRagAvailable: true, financialMetricsAvailable: true }, "is this fee allowed and total cost");
    const context = await buildGroundedContext(
      {
        routeDecision,
        question: "Is this administrative fee allowed under Saudi regulations, and what is my total cost?",
        contractRagSessionId: contractRagFixture.sessionId,
        contractType: "auto_finance",
        answerLanguage: "en",
        contractAnalysis: null,
        financialMetrics: null,
      },
      { contractRag, legalRag },
    );
    assert.equal(context.route, "all");
    assert.deepEqual(context.financialFacts, []);
    assert.deepEqual(context.analysisFacts, []);
    assert.ok(context.warnings.some((w) => w.includes("no financialMetrics object")));
    assert.ok(context.warnings.some((w) => w.includes("no contractAnalysis object")));
    // Contract and legal evidence must still be gathered independently.
    assert.ok(context.contractEvidence.length > 0);
    assert.ok(context.legalEvidence.length > 0);
  }
  console.log("PASS missing financialMetrics/contractAnalysis objects produce empty facts with explicit warnings, without blocking other sources");

  console.log("PASS contextBuilder.availability.test.ts");
}

run();
