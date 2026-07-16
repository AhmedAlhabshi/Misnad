import assert from "node:assert/strict";
import { routeChatQuestion } from "../router";
import { normalizeQuestion } from "../normalize/normalizeQuestion";
import { detectIntentSignals } from "../signals/detectIntentSignals";
import type { ChatRouterInput } from "../schema";

const BASE: Omit<ChatRouterInput, "question"> = {
  contractType: "auto_finance",
  answerLanguage: "ar",
  contractRagAvailable: true,
  legalRagAvailable: true,
  financialMetricsAvailable: true,
};

/**
 * Regression suite for the contract-expiry/date routing gap found via a
 * live trace of "متى نهاية العقد؟" — the question fell through to the
 * "general" route (zero required sources) because no phrase in
 * `CONTRACT_STRUCTURE_PHRASES` covered contract expiry/date wording, so
 * Contract RAG was never queried even though the indexed contract stated
 * the last-installment date. See `signals/patterns.ts`'s new phrase block.
 */
export async function run(): Promise<void> {
  // --- Every new phrase (wrapped in a minimal natural question) sets hasContractStructure ---
  const newPhraseQuestions = [
    "ما نهاية العقد؟",
    "ما هو تاريخ نهاية العقد؟",
    "ما هو تاريخ انتهاء العقد؟",
    "متى يكون انتهاء العقد؟",
    "متى ينتهي العقد؟",
    "متى ينتهي؟",
    "متى نهاية العقد؟",
    "ما هو آخر قسط؟",
    "ما هو تاريخ آخر قسط؟",
    "ما هي بداية العقد؟",
    "ما هو تاريخ بداية العقد؟",
    "متى يبدأ العقد؟",
    "ما هو أول قسط؟",
    "ما هو تاريخ أول قسط؟",
    "كم مدة العقد؟",
    "What is the contract end date?",
    "What is the contract expiry date?",
    "When does the contract end?",
    "When does the contract expire?",
    "Tell me the end of the contract.",
    "Tell me the expiry of the contract.",
    "What is the last installment date?",
    "What is the final payment date?",
    "What is the first installment date?",
    "What is the contract start date?",
    "When does the contract start?",
    "How long is the contract?",
  ];

  for (const question of newPhraseQuestions) {
    const signals = detectIntentSignals(normalizeQuestion(question));
    assert.equal(signals.hasContractStructure, true, `expected hasContractStructure=true for "${question}"`);
  }
  console.log(`PASS all ${newPhraseQuestions.length} new contract date/expiry phrases set hasContractStructure`);

  // --- The six questions from the live-trace investigation must route to a source that includes Contract RAG ---
  const mustIncludeContract = [
    "متى نهاية العقد؟",
    "ما تاريخ انتهاء العقد؟",
    "متى آخر قسط؟",
    "متى يبدأ العقد؟",
    "When does the contract end?",
    "What is the last installment date?",
  ];

  for (const question of mustIncludeContract) {
    const decision = routeChatQuestion({ ...BASE, question });
    const contractRequired = decision.requiredSources.some((entry) => entry.source === "contract");
    assert.ok(contractRequired, `expected route "${decision.route}" for "${question}" to require the contract source`);
    const contractEntry = decision.requiredSources.find((entry) => entry.source === "contract");
    assert.equal(contractEntry?.available, true, `expected contract source to be marked available for "${question}"`);
  }
  console.log("PASS all 6 required questions route to a source that includes Contract RAG");

  // --- The originally-failing question specifically must no longer be "general" ---
  {
    const decision = routeChatQuestion({ ...BASE, question: "متى نهاية العقد؟" });
    assert.notEqual(decision.route, "general", '"متى نهاية العقد؟" must no longer fall through to general');
    assert.equal(decision.route, "contract", '"متى نهاية العقد؟" has no financial/legal signal, so it should route to plain "contract"');
  }
  console.log('PASS "متى نهاية العقد؟" now routes to "contract" (was "general")');

  // --- Negative cases: unrelated "متى"/"when" questions must remain general, with no contract requirement ---
  const mustStayGeneral = ["متى تأسست شركة أبل؟", "When is Eid?", "متى يبدأ الصيف؟"];

  for (const question of mustStayGeneral) {
    const decision = routeChatQuestion({ ...BASE, question });
    assert.equal(decision.route, "general", `expected "${question}" to remain routed to general, got "${decision.route}"`);
    assert.equal(
      decision.requiredSources.some((entry) => entry.source === "contract"),
      false,
      `expected "${question}" to never require the contract source`,
    );
  }
  console.log("PASS unrelated 'when' questions with no contract-specific wording remain general");

  // --- A bare, standalone "متى"/"when" must never alone set hasContractStructure (requirement: no generic date trigger) ---
  {
    const signals = detectIntentSignals(normalizeQuestion("متى؟"));
    assert.equal(signals.hasContractStructure, false, "a bare 'متى' alone must never set hasContractStructure");
  }
  {
    const signals = detectIntentSignals(normalizeQuestion("When?"));
    assert.equal(signals.hasContractStructure, false, "a bare 'when' alone must never set hasContractStructure");
  }
  console.log("PASS a bare standalone متى/when never sets hasContractStructure by itself");

  console.log("PASS routing.contractDates.test.ts");
}

run();
