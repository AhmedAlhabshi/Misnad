import assert from "node:assert/strict";
import { sanitizeComposerResponse } from "../responseSanitizer";
import { composedAnswerSchema } from "../schema";
import { buildGroundedContextFixture } from "./testFixtures";

export async function run(): Promise<void> {
  // --- A well-behaved response sanitizes cleanly, with no dropped-evidence warnings ---
  {
    const context = buildGroundedContextFixture("contract_and_legal");
    const llmResponse = {
      answer: "Here is what your contract and the regulation say.",
      citations: [
        { source: "contract" as const, citation: context.contractEvidence[0].citation },
        { source: "legal" as const, citation: context.legalEvidence[0].citation },
      ],
      usedFinancialFactKeys: [],
    };
    const result = sanitizeComposerResponse(llmResponse, context, "gemini");
    composedAnswerSchema.parse(result);
    assert.equal(result.citations.length, 2);
    assert.equal(result.provider, "gemini");
    assert.equal(result.language, "EN");
    assert.equal(result.route, "contract_and_legal");
    assert.ok(!result.warnings.some((w) => w.includes("composer_dropped")));
  }
  console.log("PASS a well-behaved response sanitizes with no dropped-evidence warnings");

  // --- A hallucinated citation is dropped and reported in warnings ---
  {
    const context = buildGroundedContextFixture("legal");
    const llmResponse = {
      answer: "Answer text.",
      citations: [{ source: "legal" as const, citation: "https://fabricated.example.com/not-real" }],
      usedFinancialFactKeys: [],
    };
    const result = sanitizeComposerResponse(llmResponse, context, "gemini");
    assert.deepEqual(result.citations, []);
    assert.ok(result.warnings.some((w) => w.includes("composer_dropped_unverifiable_citations:1")));
  }
  console.log("PASS a hallucinated citation is dropped from the final answer and reported in warnings");

  // --- A hallucinated financial fact key is dropped and reported in warnings ---
  {
    const context = buildGroundedContextFixture("financial");
    const llmResponse = { answer: "Answer text.", citations: [], usedFinancialFactKeys: ["not_a_real_fact_key"] };
    const result = sanitizeComposerResponse(llmResponse, context, "gemini");
    assert.deepEqual(result.usedFinancialFactKeys, []);
    assert.ok(result.warnings.some((w) => w.includes("composer_dropped_unverifiable_fact_keys:1")));
  }
  console.log("PASS a hallucinated financial fact key is dropped from the final answer and reported in warnings");

  // --- Language mapping: ar -> AR, en -> EN ---
  {
    const arContext = buildGroundedContextFixture("general", { language: "ar" });
    const result = sanitizeComposerResponse({ answer: "إجابة", citations: [], usedFinancialFactKeys: [] }, arContext, "gemini");
    assert.equal(result.language, "AR");
  }
  console.log("PASS the composer maps GroundedContext.language 'ar'/'en' to output 'AR'/'EN'");

  // --- Amounts/figures inside the answer text are preserved exactly — the sanitizer never rewrites the answer string ---
  {
    const context = buildGroundedContextFixture("financial");
    const exactFigure = context.financialFacts[0].excerpt; // "Monthly payment: 2,400.00 SAR"
    const llmResponse = { answer: `Based on the supplied facts, ${exactFigure}.`, citations: [], usedFinancialFactKeys: [context.financialFacts[0].factKey] };
    const result = sanitizeComposerResponse(llmResponse, context, "gemini");
    assert.equal(result.answer, llmResponse.answer, "the sanitizer must never alter the answer text itself");
    assert.ok(result.answer.includes(exactFigure));
  }
  console.log("PASS the sanitizer never rewrites the answer text, preserving exact amounts/currencies/dates as given");

  // --- Existing GroundedContext warnings are forwarded ---
  {
    const context = buildGroundedContextFixture("contract", { warnings: ["source_unavailable:legal — not queried, Legal RAG marked unavailable by chat router"] });
    const result = sanitizeComposerResponse({ answer: "Answer.", citations: [], usedFinancialFactKeys: [] }, context, "gemini");
    assert.ok(result.warnings.includes("source_unavailable:legal — not queried, Legal RAG marked unavailable by chat router"));
  }
  console.log("PASS pre-existing GroundedContext warnings are forwarded into the final answer");

  console.log("PASS responseSanitizer.test.ts");
}

run();
