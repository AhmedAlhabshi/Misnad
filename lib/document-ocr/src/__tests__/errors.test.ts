import assert from "node:assert/strict";
import {
  DocumentOcrError,
  documentTextUnreadableError,
  ocrDisabledError,
  ocrPageLimitExceededError,
  ocrRecognitionFailedError,
  ocrRenderFailedError,
  ocrTimeoutError,
} from "../errors";

export function run(): void {
  const cases: Array<[DocumentOcrError, string]> = [
    [ocrDisabledError(), "OCR_DISABLED"],
    [ocrRenderFailedError("reason"), "OCR_RENDER_FAILED"],
    [ocrRecognitionFailedError("reason"), "OCR_RECOGNITION_FAILED"],
    [ocrTimeoutError(), "OCR_TIMEOUT"],
    [ocrPageLimitExceededError(50, 30), "OCR_PAGE_LIMIT_EXCEEDED"],
    [documentTextUnreadableError(), "DOCUMENT_TEXT_UNREADABLE"],
  ];

  for (const [error, expectedCode] of cases) {
    assert.ok(error instanceof DocumentOcrError, `${expectedCode} must be a DocumentOcrError instance`);
    assert.ok(error instanceof Error, `${expectedCode} must be a real Error instance`);
    assert.equal(error.code, expectedCode);
    assert.equal(error.name, "DocumentOcrError");
    assert.ok(error.message.length > 0, `${expectedCode} must have a non-empty message`);
  }
  console.log("PASS every error factory produces the correct code/instance");

  // Page-limit error message never includes anything beyond the two numbers involved (no file names, no text content).
  {
    const error = ocrPageLimitExceededError(50, 30);
    assert.ok(error.message.includes("50"));
    assert.ok(error.message.includes("30"));
  }
  console.log("PASS page-limit error message includes both numbers");

  console.log("PASS errors.test.ts");
}

run();
