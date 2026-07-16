import assert from "node:assert/strict";
import { MAX_QUESTION_LENGTH } from "@workspace/chat-router";
import { handleContractChat } from "../contractChat";
import { anyValidSessionId, createMockReq, createMockRes, fullyMockedDeps } from "./contractChatTestFixtures";

const VALID_BODY_TEMPLATE = {
  question: "What is RAG?",
  selectedContractType: "auto_finance" as const,
  answerLanguage: "EN" as const,
};

export async function run(): Promise<void> {
  // --- Invalid/empty body ---
  {
    const { req } = createMockReq({});
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps());
    assert.equal(res.statusCode, 400);
    const body = res.body as { success: boolean; error: { code: string } };
    assert.equal(body.success, false);
    assert.equal(body.error.code, "INVALID_REQUEST");
  }
  console.log("PASS an empty/invalid body returns 400 INVALID_REQUEST");

  // --- Empty question ---
  {
    const { req } = createMockReq({ ...VALID_BODY_TEMPLATE, question: "" });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps());
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, "INVALID_REQUEST");
  }
  console.log("PASS an empty question returns 400 INVALID_REQUEST");

  // --- Over-length question ---
  {
    const { req } = createMockReq({ ...VALID_BODY_TEMPLATE, question: "a".repeat(MAX_QUESTION_LENGTH + 1) });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps());
    assert.equal(res.statusCode, 400);
  }
  console.log("PASS a question over MAX_QUESTION_LENGTH returns 400 INVALID_REQUEST");

  // --- Client attempting to submit raw contract text: any unknown field is rejected outright ---
  {
    const { req } = createMockReq({ ...VALID_BODY_TEMPLATE, contractText: "This is the full raw contract text the client tried to smuggle in." });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps());
    assert.equal(res.statusCode, 400, "an unexpected raw-text-shaped field must be rejected, never silently accepted or ignored");
  }
  console.log("PASS a raw contract text field is rejected by strict schema validation");

  {
    const { req } = createMockReq({ ...VALID_BODY_TEMPLATE, maskedText: "Masked contract text attempt." });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps());
    assert.equal(res.statusCode, 400);
  }
  console.log("PASS an alternate raw/masked text field name is also rejected by strict schema validation");

  // --- Malformed session id ---
  {
    const { req } = createMockReq({ ...VALID_BODY_TEMPLATE, contractRagSessionId: "'; DROP TABLE contract_rag_sessions; --" });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps());
    assert.equal(res.statusCode, 400, "a malformed session id must never reach any retrieval/database code");
  }
  console.log("PASS a malformed contractRagSessionId is rejected by schema validation, never reaching retrieval");

  // --- Invalid financialMetrics schema (present but structurally wrong) ---
  {
    const { req } = createMockReq({ ...VALID_BODY_TEMPLATE, financialMetrics: { totallyWrongShape: true } });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps());
    assert.equal(res.statusCode, 400);
  }
  console.log("PASS a structurally invalid financialMetrics object is rejected by schema validation");

  // --- Invalid contractAnalysis schema (present but structurally wrong) ---
  {
    const { req } = createMockReq({ ...VALID_BODY_TEMPLATE, contractAnalysis: { totallyWrongShape: true } });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps());
    assert.equal(res.statusCode, 400);
  }
  console.log("PASS a structurally invalid contractAnalysis object is rejected by schema validation");

  // --- Invalid selectedContractType / answerLanguage ---
  {
    const { req } = createMockReq({ ...VALID_BODY_TEMPLATE, selectedContractType: "not_a_real_type" });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps());
    assert.equal(res.statusCode, 400);
  }
  console.log("PASS an unrecognized selectedContractType is rejected");

  {
    const { req } = createMockReq({ ...VALID_BODY_TEMPLATE, answerLanguage: "fr" });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps());
    assert.equal(res.statusCode, 400);
  }
  console.log("PASS an unrecognized answerLanguage is rejected");

  // --- A well-formed session id (format-valid) is accepted at the schema layer, even if it doesn't exist yet ---
  {
    const { req } = createMockReq({ ...VALID_BODY_TEMPLATE, contractRagSessionId: anyValidSessionId() });
    const res = createMockRes();
    await handleContractChat(req, res, fullyMockedDeps());
    assert.equal(res.statusCode, 200, "a well-formed session id must pass schema validation regardless of whether it exists");
  }
  console.log("PASS a well-formed (format-valid) session id passes request validation");

  console.log("PASS contractChat.validation.test.ts");
}

run();
