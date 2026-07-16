import assert from "node:assert/strict";
import { composeAnswer } from "../composer";
import { composedAnswerSchema, llmComposerResponseSchema } from "../schema";
import { buildGroundedContextFixture, makeSingleResponseProvider, validLlmResponseTextFor } from "./testFixtures";

export async function run(): Promise<void> {
  // --- A well-formed llmComposerResponse parses ---
  {
    const parsed = llmComposerResponseSchema.parse({
      answer: "Test answer.",
      citations: [{ source: "contract", citation: "Your contract — X" }],
      usedFinancialFactKeys: ["monthly_payment"],
    });
    assert.equal(parsed.answer, "Test answer.");
  }
  console.log("PASS a well-formed llmComposerResponse parses");

  // --- An invalid citation source is rejected ---
  {
    assert.throws(() =>
      llmComposerResponseSchema.parse({ answer: "x", citations: [{ source: "financial", citation: "financialMetrics.x" }], usedFinancialFactKeys: [] }),
    );
  }
  console.log("PASS a citation with source 'financial' (not contract/legal) is rejected");

  // --- An empty answer is rejected ---
  {
    assert.throws(() => llmComposerResponseSchema.parse({ answer: "", citations: [], usedFinancialFactKeys: [] }));
  }
  console.log("PASS an empty answer string is rejected");

  // --- A well-formed composedAnswer parses ---
  {
    const parsed = composedAnswerSchema.parse({
      answer: "Test.",
      language: "EN",
      route: "general",
      confidence: "high",
      evidenceStatus: "sufficient",
      citations: [],
      usedFinancialFactKeys: [],
      warnings: [],
      provider: "gemini",
    });
    assert.equal(parsed.route, "general");
  }
  console.log("PASS a well-formed composedAnswer parses");

  // --- An invalid language value is rejected (must be 'AR'/'EN', not 'ar'/'en') ---
  {
    assert.throws(() =>
      composedAnswerSchema.parse({
        answer: "Test.",
        language: "ar",
        route: "general",
        confidence: "high",
        evidenceStatus: "sufficient",
        citations: [],
        usedFinancialFactKeys: [],
        warnings: [],
        provider: "gemini",
      }),
    );
  }
  console.log("PASS a lowercase language value is rejected — output language must be 'AR'/'EN'");

  // --- An invalid confidence/evidenceStatus enum value is rejected ---
  {
    assert.throws(() =>
      composedAnswerSchema.parse({
        answer: "Test.",
        language: "EN",
        route: "general",
        confidence: "very-high",
        evidenceStatus: "sufficient",
        citations: [],
        usedFinancialFactKeys: [],
        warnings: [],
        provider: "gemini",
      }),
    );
  }
  console.log("PASS an unrecognized confidence value is rejected");

  // --- The real composeAnswer output always validates against composedAnswerSchema, for every route ---
  {
    for (const route of ["general", "contract", "legal", "financial", "contract_and_legal", "contract_and_financial", "all"] as const) {
      const context = buildGroundedContextFixture(route);
      const result = await composeAnswer(context, { provider: makeSingleResponseProvider(validLlmResponseTextFor(context)), providerName: "mock" });
      const revalidated = composedAnswerSchema.parse(result);
      assert.equal(revalidated.route, route);
    }
  }
  console.log("PASS composeAnswer's real output always validates against composedAnswerSchema for every route");

  console.log("PASS schema.validation.test.ts");
}

run();
