import assert from "node:assert/strict";
import { contractChatSuccessResponseSchema } from "../../schemas/contractChat.schema";
import { handleContractChat } from "../contractChat";
import {
  createMockReq,
  createMockRes,
  fullyMockedDeps,
  makeHonestMockProvider,
  setupContractRagFixture,
  setupLegalRagFixture,
} from "./contractChatTestFixtures";

const AUTO_FINANCE_MASKED_TEXT =
  "Early Termination\nEither party may terminate this financing agreement early by giving thirty (30) days written notice, subject to an early settlement fee.\n\nAdministrative Fee\nThe borrower shall pay a one-time administrative fee of [AMOUNT] SAR upon signing.\n\nMonthly Installment\nThe borrower shall pay a monthly installment of [AMOUNT] SAR on the first day of each month.";

function validFinancialMetrics() {
  const knownMoney = (value: number, currency = "SAR") => ({ value, currency, status: "known" as const, source: "test", reason: null, confidence: "high" as const });
  const unavailableMoney = () => ({ value: null, currency: null, status: "unavailable" as const, source: null, reason: "not stated", confidence: "low" as const });
  const unavailablePercentage = () => ({ value: null, status: "unavailable" as const, source: null, reason: "not stated", confidence: "low" as const });
  return {
    schemaVersion: "1.0" as const,
    currency: "SAR",
    paymentObligations: [],
    informationalAmounts: [],
    recurringCommitment: {
      actualMonthlyAmount: knownMoney(2400),
      monthlyEquivalent: knownMoney(2400),
      annualEquivalent: knownMoney(28800),
      minimumMonthlyAmount: unavailableMoney(),
      maximumMonthlyAmount: unavailableMoney(),
      isVariable: false,
      includedObligationIds: [],
    },
    contractDuration: { value: 48, unit: "months" as const, months: 48, days: null, startDate: null, endDate: null, status: "known" as const, source: "test", reason: null, confidence: "high" as const },
    totalCost: {
      statedTotalCost: unavailableMoney(),
      calculatedBaseCost: knownMoney(96000),
      calculatedCoreObligations: knownMoney(134400),
      calculatedKnownCost: knownMoney(134400),
      financingRepaymentTotal: knownMoney(115200),
      financingCost: knownMoney(19200),
      estimatedContractCost: knownMoney(134400),
      differenceFromStated: { classification: "unavailable" as const, amount: unavailableMoney(), reason: null },
    },
    fees: { items: [], totalKnownFees: knownMoney(1200), mandatoryFees: knownMoney(1200), upfrontFees: knownMoney(1200), recurringFees: unavailableMoney(), conditionalFees: unavailableMoney(), hasUndefinedFees: false, status: "known" as const },
    penalties: { items: [], totalKnownPenalties: unavailableMoney(), highestKnownPenalty: unavailableMoney(), hasUndefinedPenalty: false, status: "unavailable" as const },
    ratios: {
      feesToBaseCost: { value: 1.25, status: "known" as const, source: "test", reason: null, confidence: "high" as const },
      penaltiesToBaseCost: unavailablePercentage(),
      upfrontPaymentToBaseCost: unavailablePercentage(),
      balloonPaymentToBaseCost: unavailablePercentage(),
      totalCostIncrease: unavailablePercentage(),
      recurringPaymentToIncome: unavailablePercentage(),
    },
    exposure: {
      totalKnownExposure: knownMoney(134400),
      monthlyExposure: knownMoney(2400),
      annualExposure: knownMoney(28800),
      upfrontExposure: knownMoney(1200),
      contingentExposure: unavailableMoney(),
      maximumSinglePayment: unavailableMoney(),
      unquantifiedContingentExposure: false,
      totalsByCurrency: [],
    },
    positiveFinancialFactors: [],
    calculationMetadata: { formulasUsed: [], unavailableCalculations: [], warnings: [], conflicts: [], excludedValues: [] },
  };
}

export async function run(): Promise<void> {
  const contractRag = await setupContractRagFixture(AUTO_FINANCE_MASKED_TEXT);
  const legalRag = await setupLegalRagFixture();
  const ragDeps = {
    contractRag: { repository: contractRag.repository, embeddingProvider: contractRag.embeddingProvider },
    legalRag: { repository: legalRag.repository, embeddingProvider: legalRag.embeddingProvider },
  };

  // --- General question, no session ---
  {
    const { req } = createMockReq({ question: "What is RAG?", selectedContractType: "auto_finance", answerLanguage: "EN" });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps());
    assert.equal(res.statusCode, 200);
    const body = res.body as { success: true; route: string; answer: { citations: unknown[] } };
    assert.equal(body.success, true);
    assert.equal(body.route, "general");
    assert.deepEqual(body.answer.citations, []);
    contractChatSuccessResponseSchema.parse(res.body);
  }
  console.log("PASS a valid general question without a session succeeds with route=general");

  // --- Contract question with a valid session ---
  {
    const { req } = createMockReq({
      question: "What does my contract say about early termination?",
      contractRagSessionId: contractRag.sessionId,
      selectedContractType: "auto_finance",
      answerLanguage: "EN",
    });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps(ragDeps));
    assert.equal(res.statusCode, 200);
    const body = res.body as { success: true; route: string; answer: { citations: Array<{ source: string }> } };
    assert.equal(body.route, "contract");
    assert.ok(body.answer.citations.some((c) => c.source === "contract"));
    contractChatSuccessResponseSchema.parse(res.body);
  }
  console.log("PASS a valid contract question with a session succeeds with route=contract and contract citations");

  // --- Legal question ---
  {
    const { req } = createMockReq({
      question: "What is the maximum administrative charge a creditor can impose under the regulations?",
      selectedContractType: "auto_finance",
      answerLanguage: "EN",
    });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps(ragDeps));
    assert.equal(res.statusCode, 200);
    const body = res.body as { success: true; route: string; answer: { citations: Array<{ source: string; authority?: string }> } };
    assert.equal(body.route, "legal");
    assert.ok(body.answer.citations.some((c) => c.source === "legal" && c.authority));
  }
  console.log("PASS a legal question succeeds with route=legal and an official authority/citation");

  // --- Financial question ---
  {
    const { req } = createMockReq({
      question: "How much will I pay every month?",
      selectedContractType: "auto_finance",
      answerLanguage: "EN",
      financialMetrics: validFinancialMetrics(),
    });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps(ragDeps));
    assert.equal(res.statusCode, 200);
    const body = res.body as { success: true; route: string; answer: { usedFinancialFactKeys: string[] } };
    assert.equal(body.route, "financial");
    assert.ok(body.answer.usedFinancialFactKeys.includes("monthly_payment"));
  }
  console.log("PASS a financial question succeeds with route=financial using exactly the supplied facts");

  // --- contract_and_legal ---
  {
    const { req } = createMockReq({
      question: "Is this early termination penalty allowed under Saudi regulations?",
      contractRagSessionId: contractRag.sessionId,
      selectedContractType: "auto_finance",
      answerLanguage: "EN",
    });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps(ragDeps));
    assert.equal(res.statusCode, 200);
    const body = res.body as { success: true; route: string; answer: { citations: Array<{ source: string }> } };
    assert.equal(body.route, "contract_and_legal");
    assert.ok(body.answer.citations.some((c) => c.source === "contract"));
    assert.ok(body.answer.citations.some((c) => c.source === "legal"));
  }
  console.log("PASS a contract_and_legal question separates and cites both contract and legal evidence");

  // --- all route ---
  {
    const { req } = createMockReq({
      question: "Is this early termination penalty and administrative fee allowed under Saudi regulations, and what is my total cost?",
      contractRagSessionId: contractRag.sessionId,
      selectedContractType: "auto_finance",
      answerLanguage: "EN",
      financialMetrics: validFinancialMetrics(),
    });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps(ragDeps));
    assert.equal(res.statusCode, 200);
    const body = res.body as { success: true; route: string; answer: { citations: Array<{ source: string }>; usedFinancialFactKeys: string[] } };
    assert.equal(body.route, "all");
    assert.ok(body.answer.citations.some((c) => c.source === "contract"));
    assert.ok(body.answer.citations.some((c) => c.source === "legal"));
    assert.ok(body.answer.usedFinancialFactKeys.length > 0);
  }
  console.log("PASS an 'all' route question uses contract, legal, and financial evidence together");

  // --- Arabic language ---
  {
    const { req } = createMockReq({
      question: "ما مدة العقد حسب الملف؟",
      contractRagSessionId: contractRag.sessionId,
      selectedContractType: "auto_finance",
      answerLanguage: "AR",
    });
    const res = createMockRes();
    await handleContractChat(
      req,
      res,
      fullyMockedDeps({ ...ragDeps, composeAnswerOptions: { provider: makeHonestMockProvider("هذا ما يقوله عقدك."), fallbackProvider: makeHonestMockProvider("هذا ما يقوله عقدك.") } }),
    );
    assert.equal(res.statusCode, 200);
    const body = res.body as { success: true; answer: { language: string } };
    assert.equal(body.answer.language, "AR");
  }
  console.log("PASS an Arabic request produces an Arabic-tagged answer");

  // --- The router's route can never be overridden by client input, even if smuggled past the HTTP schema ---
  {
    const { req } = createMockReq({
      question: "What does my contract say about early termination?",
      contractRagSessionId: contractRag.sessionId,
      selectedContractType: "auto_finance",
      answerLanguage: "EN",
    });
    // Simulate an attacker-controlled extra property surviving to the parsed object (defense-in-depth check beyond the schema's own `.strict()` rejection).
    (req.body as Record<string, unknown>).route = "financial";
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps(ragDeps));
    // The strict schema rejects the extra field outright.
    assert.equal(res.statusCode, 400);
  }
  console.log("PASS an attempted client-supplied 'route' field is rejected by strict schema validation, never influencing routing");

  // --- Hallucinated citations remain filtered end-to-end ---
  {
    const { req } = createMockReq({
      question: "What is the maximum administrative charge a creditor can impose under the regulations?",
      selectedContractType: "auto_finance",
      answerLanguage: "EN",
    });
    const res = createMockRes();
    const dishonestProvider = {
      async generate() {
        const rawText = JSON.stringify({
          answer: "Here is the answer.",
          citations: [{ source: "legal", citation: "https://fabricated.example.com/not-real" }],
          usedFinancialFactKeys: [],
        });
        return { rawText, diagnostics: { rawTextLength: rawText.length } };
      },
    };
    await handleContractChat(req, res, fullyMockedDeps({ ...ragDeps, composeAnswerOptions: { provider: dishonestProvider, fallbackProvider: dishonestProvider } }));
    assert.equal(res.statusCode, 200);
    const body = res.body as { success: true; answer: { citations: unknown[]; warnings: string[] } };
    assert.deepEqual(body.answer.citations, [], "a hallucinated citation must never survive to the HTTP response");
    assert.ok(body.answer.warnings.some((w) => w.includes("composer_dropped_unverifiable_citations")));
  }
  console.log("PASS a hallucinated citation is filtered out end-to-end and never reaches the HTTP response");

  console.log("PASS contractChat.routes.test.ts");
}

run();
