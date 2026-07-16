import assert from "node:assert/strict";
import { routeChatQuestion } from "../router";
import type { ChatRouterInput } from "../schema";

const BASE: Omit<ChatRouterInput, "question"> = {
  contractType: "lease",
  answerLanguage: "ar",
  contractRagAvailable: true,
  legalRagAvailable: true,
  financialMetricsAvailable: true,
};

export async function run(): Promise<void> {
  {
    const decision = routeChatQuestion({ ...BASE, question: "اشرح لي بند الإنهاء المبكر في عقدي" });
    assert.equal(decision.route, "contract");
  }
  console.log('PASS "اشرح لي بند الإنهاء المبكر في عقدي" -> contract');

  {
    const decision = routeChatQuestion({ ...BASE, question: "هل يحق للمؤجر إخلائي بسبب التأخر في السداد؟" });
    assert.equal(decision.route, "contract_and_legal");
  }
  console.log('PASS "هل يحق للمؤجر إخلائي بسبب التأخر في السداد؟" -> contract_and_legal');

  {
    const decision = routeChatQuestion({ ...BASE, question: "كم المبلغ الذي سأدفعه شهرياً؟" });
    assert.equal(decision.route, "financial");
  }
  console.log('PASS "كم المبلغ الذي سأدفعه شهرياً؟" -> financial');

  {
    const decision = routeChatQuestion({ ...BASE, question: "هل رسوم التأخير الموجودة في العقد مسموحة نظامياً؟" });
    assert.ok(
      decision.route === "all" || decision.route === "contract_and_legal",
      `expected "all" or "contract_and_legal", got "${decision.route}"`,
    );
    // Documented policy (see routing/selectRoute.ts): this question names a
    // quantifiable fee ("رسوم التأخير") already tracked by the financial
    // metrics engine, so the router's default policy escalates to "all"
    // rather than stopping at "contract_and_legal" — see the final report's
    // "Ambiguities" section.
    assert.equal(decision.route, "all", "documented default policy for a fee-specific legal-compliance question is 'all'");
  }
  console.log('PASS "هل رسوم التأخير الموجودة في العقد مسموحة نظامياً؟" -> all (documented default policy)');

  {
    const decision = routeChatQuestion({ ...BASE, question: "ما مدة العقد حسب الملف؟" });
    assert.equal(decision.route, "contract");
  }
  console.log('PASS "ما مدة العقد حسب الملف؟" -> contract');

  {
    const decision = routeChatQuestion({ ...BASE, question: "ما معنى الشرط الجزائي؟" });
    assert.equal(decision.route, "general", "documented policy: pure term-definition questions route to general (see final report)");
  }
  console.log('PASS "ما معنى الشرط الجزائي؟" -> general (documented policy)');

  // --- Arabic diacritics/punctuation variants of the same question route identically ---
  {
    const plain = routeChatQuestion({ ...BASE, question: "هل هذا مسموح نظاميا" });
    const diacritized = routeChatQuestion({ ...BASE, question: "هَلْ هَذَا مَسْمُوحٌ نِظَامِيًّا؟" });
    assert.equal(plain.route, diacritized.route, "diacritics/punctuation must not change the routing decision");
  }
  console.log("PASS Arabic diacritics and punctuation variants of the same question route identically");

  console.log("PASS routing.arabic.test.ts");
}

run();
