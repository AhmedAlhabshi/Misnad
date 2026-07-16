import assert from "node:assert/strict";
import { routeChatQuestion } from "../router";
import type { ChatRouterInput } from "../schema";

const FULLY_AVAILABLE: Omit<ChatRouterInput, "question"> = {
  contractType: "lease",
  answerLanguage: "en",
  contractRagAvailable: true,
  legalRagAvailable: true,
  financialMetricsAvailable: true,
};

export async function run(): Promise<void> {
  // --- A contract question when Contract RAG is unavailable: route preserved, unavailability reported explicitly ---
  {
    const decision = routeChatQuestion({
      ...FULLY_AVAILABLE,
      question: "What does my contract say about early termination?",
      contractRagAvailable: false,
    });
    assert.equal(decision.route, "contract", "route must be preserved, not downgraded, when the required source is unavailable");
    assert.deepEqual(decision.requiredSources, [{ source: "contract", available: false }]);
    assert.deepEqual(decision.unavailableRequiredSources, ["contract"]);
    assert.ok(decision.reasons.some((r) => r.includes("required_source_unavailable:contract")));
  }
  console.log("PASS a contract question with Contract RAG unavailable preserves route=contract and reports contract unavailable");

  // --- A legal comparison when Legal RAG is unavailable: route preserved, never silently downgraded to general ---
  {
    const decision = routeChatQuestion({
      ...FULLY_AVAILABLE,
      question: "Is this late payment penalty allowed under Saudi regulations?",
      legalRagAvailable: false,
    });
    assert.equal(decision.route, "contract_and_legal", "a legal-comparison question must never be silently downgraded to general");
    assert.deepEqual(
      decision.requiredSources.sort((a, b) => a.source.localeCompare(b.source)),
      [
        { source: "contract", available: true },
        { source: "legal", available: false },
      ].sort((a, b) => a.source.localeCompare(b.source)),
    );
    assert.deepEqual(decision.unavailableRequiredSources, ["legal"]);
  }
  console.log("PASS a legal-comparison question with Legal RAG unavailable preserves route=contract_and_legal, never downgrades to general");

  // --- A financial question when metrics are unavailable ---
  {
    const decision = routeChatQuestion({
      ...FULLY_AVAILABLE,
      question: "How much will I pay every month?",
      financialMetricsAvailable: false,
    });
    assert.equal(decision.route, "financial", "route must be preserved when financial metrics are unavailable");
    assert.deepEqual(decision.requiredSources, [{ source: "financial", available: false }]);
    assert.deepEqual(decision.unavailableRequiredSources, ["financial"]);
  }
  console.log("PASS a financial question with metrics unavailable preserves route=financial and reports financial unavailable");

  // --- A general question requires no sources regardless of availability ---
  {
    const decision = routeChatQuestion({
      ...FULLY_AVAILABLE,
      question: "What is RAG?",
      contractRagAvailable: false,
      legalRagAvailable: false,
      financialMetricsAvailable: false,
    });
    assert.equal(decision.route, "general");
    assert.deepEqual(decision.requiredSources, []);
    assert.deepEqual(decision.unavailableRequiredSources, []);
  }
  console.log("PASS a general question requires no sources even when nothing is available");

  console.log("PASS routing.availability.test.ts");
}

run();
