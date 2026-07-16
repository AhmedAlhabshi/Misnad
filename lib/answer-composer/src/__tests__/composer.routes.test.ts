import assert from "node:assert/strict";
import type { ChatRoute } from "@workspace/chat-router";
import { composeAnswer } from "../composer";
import { composedAnswerSchema } from "../schema";
import { buildGroundedContextFixture, makeSingleResponseProvider, validLlmResponseTextFor } from "./testFixtures";

const ALL_ROUTES: ChatRoute[] = ["general", "contract", "legal", "financial", "contract_and_legal", "contract_and_financial", "all"];

export async function run(): Promise<void> {
  // --- Every route composes a valid answer using only the evidence actually present ---
  for (const route of ALL_ROUTES) {
    const context = buildGroundedContextFixture(route);
    const provider = makeSingleResponseProvider(validLlmResponseTextFor(context));
    const result = await composeAnswer(context, { provider, providerName: "mock" });
    composedAnswerSchema.parse(result);
    assert.equal(result.route, route);
    assert.equal(result.provider, "mock");

    if (route === "contract" || route === "contract_and_legal" || route === "contract_and_financial" || route === "all") {
      assert.ok(result.citations.some((c) => c.source === "contract"), `${route} must cite contract evidence`);
    }
    if (route === "legal" || route === "contract_and_legal" || route === "all") {
      assert.ok(result.citations.some((c) => c.source === "legal"), `${route} must cite legal evidence`);
    }
    if (route === "financial" || route === "contract_and_financial" || route === "all") {
      assert.ok(result.usedFinancialFactKeys.length > 0, `${route} must use financial fact keys`);
    }
    if (route === "general") {
      assert.deepEqual(result.citations, []);
      assert.deepEqual(result.usedFinancialFactKeys, []);
      assert.equal(result.confidence, "high");
    }
  }
  console.log("PASS every route composes a valid, correctly-cited answer from mocked provider output");

  // --- Arabic and English both compose correctly, with the language field mapped ---
  {
    const enContext = buildGroundedContextFixture("contract", { language: "en" });
    const enResult = await composeAnswer(enContext, { provider: makeSingleResponseProvider(validLlmResponseTextFor(enContext)), providerName: "mock" });
    assert.equal(enResult.language, "EN");

    const arContext = buildGroundedContextFixture("contract", { language: "ar" });
    const arResult = await composeAnswer(arContext, {
      provider: makeSingleResponseProvider(validLlmResponseTextFor(arContext, "هذا ما يقوله عقدك حول الإنهاء المبكر.")),
      providerName: "mock",
    });
    assert.equal(arResult.language, "AR");
    assert.ok(arResult.answer.includes("عقدك"));
  }
  console.log("PASS Arabic and English answers both compose correctly with the mapped language field");

  // --- contract-only answer never contains legal citations or financial fact keys ---
  {
    const context = buildGroundedContextFixture("contract");
    const result = await composeAnswer(context, { provider: makeSingleResponseProvider(validLlmResponseTextFor(context)), providerName: "mock" });
    assert.ok(result.citations.every((c) => c.source === "contract"));
    assert.deepEqual(result.usedFinancialFactKeys, []);
  }
  console.log("PASS a contract-only route never surfaces legal citations or financial fact keys");

  // --- legal-only answer includes the official authority and citation ---
  {
    const context = buildGroundedContextFixture("legal");
    const result = await composeAnswer(context, { provider: makeSingleResponseProvider(validLlmResponseTextFor(context)), providerName: "mock" });
    assert.equal(result.citations.length, 1);
    assert.equal(result.citations[0].source, "legal");
    assert.equal(result.citations[0].authority, context.legalEvidence[0].authority);
    assert.equal(result.citations[0].citation, context.legalEvidence[0].citation);
  }
  console.log("PASS a legal-only answer includes the official authority and citation");

  // --- financial-only answer uses exactly the supplied fact, no citations ---
  {
    const context = buildGroundedContextFixture("financial");
    const result = await composeAnswer(context, { provider: makeSingleResponseProvider(validLlmResponseTextFor(context)), providerName: "mock" });
    assert.deepEqual(result.citations, []);
    assert.deepEqual(result.usedFinancialFactKeys, [context.financialFacts[0].factKey]);
  }
  console.log("PASS a financial-only answer uses exactly the supplied fact key and no citations");

  // --- insufficient evidence: evidenceStatus/confidence reflect the gap ---
  {
    const context = buildGroundedContextFixture("contract", { contractEvidence: [] });
    const result = await composeAnswer(context, {
      provider: makeSingleResponseProvider(JSON.stringify({ answer: "I could not find that clause in your contract.", citations: [], usedFinancialFactKeys: [] })),
      providerName: "mock",
    });
    assert.equal(result.evidenceStatus, "insufficient");
    assert.equal(result.confidence, "low");
    assert.deepEqual(result.citations, []);
  }
  console.log("PASS insufficient evidence yields evidenceStatus=insufficient and confidence=low");

  // --- empty citation list is a valid, schema-passing response (not an error) ---
  {
    const context = buildGroundedContextFixture("general");
    const result = await composeAnswer(context, {
      provider: makeSingleResponseProvider(JSON.stringify({ answer: "RAG stands for Retrieval-Augmented Generation.", citations: [], usedFinancialFactKeys: [] })),
      providerName: "mock",
    });
    composedAnswerSchema.parse(result);
    assert.deepEqual(result.citations, []);
  }
  console.log("PASS an empty citation list is a valid response, never rejected");

  console.log("PASS composer.routes.test.ts");
}

run();
