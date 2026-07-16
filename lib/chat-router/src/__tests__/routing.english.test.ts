import assert from "node:assert/strict";
import { routeChatQuestion } from "../router";
import type { ChatRouterInput } from "../schema";

const BASE: Omit<ChatRouterInput, "question"> = {
  contractType: "lease",
  answerLanguage: "en",
  contractRagAvailable: true,
  legalRagAvailable: true,
  financialMetricsAvailable: true,
};

export async function run(): Promise<void> {
  {
    const decision = routeChatQuestion({ ...BASE, question: "What does my contract say about early termination?" });
    assert.equal(decision.route, "contract");
  }
  console.log('PASS "What does my contract say about early termination?" -> contract');

  {
    const decision = routeChatQuestion({ ...BASE, question: "Is this late payment penalty allowed under Saudi regulations?" });
    assert.equal(decision.route, "contract_and_legal");
  }
  console.log('PASS "Is this late payment penalty allowed under Saudi regulations?" -> contract_and_legal');

  {
    const decision = routeChatQuestion({ ...BASE, question: "How much will I pay every month?" });
    assert.equal(decision.route, "financial");
  }
  console.log('PASS "How much will I pay every month?" -> financial');

  {
    const decision = routeChatQuestion({ ...BASE, question: "Compare this cancellation clause with the applicable law." });
    assert.equal(decision.route, "contract_and_legal");
  }
  console.log('PASS "Compare this cancellation clause with the applicable law." -> contract_and_legal');

  {
    const decision = routeChatQuestion({ ...BASE, question: "What is RAG?" });
    assert.equal(decision.route, "general");
  }
  console.log('PASS "What is RAG?" -> general');

  // --- Casing variants of the same question route identically ---
  {
    const lower = routeChatQuestion({ ...BASE, question: "what does my contract say about early termination?" });
    const upper = routeChatQuestion({ ...BASE, question: "WHAT DOES MY CONTRACT SAY ABOUT EARLY TERMINATION?" });
    assert.equal(lower.route, upper.route);
    assert.equal(lower.route, "contract");
  }
  console.log("PASS English casing variants of the same question route identically");

  // --- A question genuinely requiring both contract evidence and a financial fact (no legal aspect) ---
  {
    const decision = routeChatQuestion({
      ...BASE,
      question: "According to my contract's payment terms, how much is my total cost?",
    });
    assert.equal(decision.route, "contract_and_financial");
  }
  console.log("PASS a combined contract+financial question (no legal aspect) -> contract_and_financial");

  console.log("PASS routing.english.test.ts");
}

run();
