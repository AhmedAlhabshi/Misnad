import assert from "node:assert/strict";
import { chatRouteDecisionSchema, chatRouterInputSchema } from "../schema";
import { routeChatQuestion } from "../router";

export async function run(): Promise<void> {
  // --- A well-formed input parses ---
  {
    const parsed = chatRouterInputSchema.parse({
      question: "What does my contract say about early termination?",
      contractType: "lease",
      answerLanguage: "en",
      contractRagAvailable: true,
      legalRagAvailable: true,
      financialMetricsAvailable: true,
    });
    assert.equal(parsed.question, "What does my contract say about early termination?");
  }
  console.log("PASS a well-formed router input parses");

  // --- An invalid contractType is rejected ---
  {
    assert.throws(() =>
      chatRouterInputSchema.parse({
        question: "test",
        contractType: "not_a_real_type",
        answerLanguage: "en",
        contractRagAvailable: true,
        legalRagAvailable: true,
        financialMetricsAvailable: true,
      }),
    );
  }
  console.log("PASS an unrecognized contractType is rejected");

  // --- An invalid answerLanguage is rejected ---
  {
    assert.throws(() =>
      chatRouterInputSchema.parse({
        question: "test",
        contractType: "lease",
        answerLanguage: "fr",
        contractRagAvailable: true,
        legalRagAvailable: true,
        financialMetricsAvailable: true,
      }),
    );
  }
  console.log("PASS an unrecognized answerLanguage is rejected");

  // --- Non-boolean availability flags are rejected ---
  {
    assert.throws(() =>
      chatRouterInputSchema.parse({
        question: "test",
        contractType: "lease",
        answerLanguage: "en",
        contractRagAvailable: "yes",
        legalRagAvailable: true,
        financialMetricsAvailable: true,
      }),
    );
  }
  console.log("PASS a non-boolean availability flag is rejected");

  // --- The router's own output always validates against the output schema (required fields present) ---
  {
    const decision = routeChatQuestion({
      question: "Is this late payment penalty allowed under Saudi regulations?",
      contractType: "lease",
      answerLanguage: "en",
      contractRagAvailable: true,
      legalRagAvailable: true,
      financialMetricsAvailable: true,
    });
    const revalidated = chatRouteDecisionSchema.parse(decision);
    assert.ok(revalidated.route.length > 0);
    assert.ok(Array.isArray(revalidated.requiredSources));
    assert.ok(revalidated.confidence >= 0 && revalidated.confidence <= 1);
    assert.ok(revalidated.reasons.length > 0);
    assert.equal(typeof revalidated.normalizedQuestion, "string");
    assert.equal(revalidated.deterministic, true);
  }
  console.log("PASS routeChatQuestion's output always validates against chatRouteDecisionSchema and includes all required fields");

  console.log("PASS schema.validation.test.ts");
}

run();
