import assert from "node:assert/strict";
import { CONTRACT_TYPE_VALUES } from "@workspace/contract-types";
import { getSuggestedQuestions } from "../suggestedQuestions";

export async function run(): Promise<void> {
  for (const contractType of CONTRACT_TYPE_VALUES) {
    for (const language of ["ar", "en"] as const) {
      const questions = getSuggestedQuestions(contractType, language);
      assert.ok(questions.length >= 3, `${contractType}/${language} must have at least 3 suggested questions`);
      assert.ok(questions.length <= 5, `${contractType}/${language} must have at most 5 suggested questions`);
      for (const question of questions) {
        assert.ok(question.trim().length > 0, `${contractType}/${language} must never contain an empty suggested question`);
      }
    }
  }
  console.log("PASS every contract type has 3-5 non-empty suggested questions in both languages");

  // --- Arabic and English sets are language-appropriate and distinct per contract type ---
  {
    const leaseAr = getSuggestedQuestions("lease", "ar");
    const leaseEn = getSuggestedQuestions("lease", "en");
    assert.ok(leaseAr.some((q) => q.includes("المؤجر") || q.includes("العقد")));
    assert.notDeepEqual(leaseAr, leaseEn);
  }
  console.log("PASS suggested questions are language-appropriate and vary by contract type");

  console.log("PASS suggestedQuestions.test.ts");
}

run();
