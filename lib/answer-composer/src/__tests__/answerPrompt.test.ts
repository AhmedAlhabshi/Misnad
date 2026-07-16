import assert from "node:assert/strict";
import { buildAnswerCorrectionPrompt, buildAnswerPrompt } from "../answerPrompt";
import { buildGroundedContextFixture } from "./testFixtures";

export async function run(): Promise<void> {
  // --- The initial prompt includes the serialized context and a task restatement ---
  {
    const context = buildGroundedContextFixture("contract");
    const prompt = buildAnswerPrompt(context);
    assert.ok(prompt.includes(context.contractEvidence[0].excerpt));
    assert.ok(prompt.toLowerCase().includes("answer the question"));
  }
  console.log("PASS buildAnswerPrompt includes the serialized context and a task instruction");

  // --- The correction prompt includes the original context, the validation errors, and a preview of the rejected response ---
  {
    const context = buildGroundedContextFixture("legal");
    const prompt = buildAnswerCorrectionPrompt({
      context,
      previousResponseText: "not valid json at all",
      validationErrorSummary: "- (root): expected object, received string",
    });
    assert.ok(prompt.includes(context.legalEvidence[0].excerpt), "the correction prompt must re-send the original evidence");
    assert.ok(prompt.includes("expected object, received string"));
    assert.ok(prompt.includes("not valid json at all"));
    assert.ok(prompt.toLowerCase().includes("rejected"));
  }
  console.log("PASS buildAnswerCorrectionPrompt includes the original context, validation errors, and the previous rejected response");

  console.log("PASS answerPrompt.test.ts");
}

run();
