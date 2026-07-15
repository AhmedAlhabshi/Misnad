import assert from "node:assert/strict";
import { filterValidCitations, validateCitedChunkIds, validateResultCitation } from "../citations/validate";
import type { LegalSearchResultItem } from "../retrieval/service";

function makeResult(overrides: Partial<LegalSearchResultItem> = {}): LegalSearchResultItem {
  return {
    chunkId: "sama_regulations_consumer_financing::Article_9::0",
    authority: "sama",
    documentTitle: "Regulations for Consumer Financing",
    articleNumber: "Article 9",
    section: null,
    excerpt: "All fees must not exceed 1%.",
    officialSourceUrl: "https://rulebook.sama.gov.sa/en/regulations-consumer-financing",
    topics: ["fees"],
    score: 0.8,
    ...overrides,
  };
}

export function run(): void {
  // --- A well-formed result passes ---
  {
    const result = validateResultCitation(makeResult());
    assert.equal(result.valid, true);
  }
  console.log("PASS a well-formed result with an official URL passes citation validation");

  // --- An unofficial URL is rejected ---
  {
    const result = validateResultCitation(makeResult({ officialSourceUrl: "https://some-law-firm-blog.example/summary" }));
    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("allow-list"));
  }
  console.log("PASS a result citing an unofficial URL is rejected");

  // --- Missing required fields are rejected ---
  {
    assert.equal(validateResultCitation(makeResult({ chunkId: "" })).valid, false);
    assert.equal(validateResultCitation(makeResult({ authority: "" })).valid, false);
    assert.equal(validateResultCitation(makeResult({ documentTitle: "" })).valid, false);
  }
  console.log("PASS a result missing any required citation field is rejected");

  // --- filterValidCitations drops only the invalid ones, keeps the valid ones ---
  {
    const results = [makeResult({ chunkId: "a" }), makeResult({ chunkId: "b", officialSourceUrl: "https://blog.example/x" })];
    const filtered = filterValidCitations(results);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].chunkId, "a");
  }
  console.log("PASS filterValidCitations keeps valid results and drops invalid ones");

  // --- validateCitedChunkIds: every cited id must be part of the retrieved set ---
  {
    const retrieved = new Set(["a", "b", "c"]);
    const ok = validateCitedChunkIds(["a", "b"], retrieved);
    assert.equal(ok.valid, true);
    assert.deepEqual(ok.invalidChunkIds, []);
  }
  console.log("PASS citing only retrieved chunk ids passes validation");

  // --- A fabricated/unretrieved chunkId is caught ---
  {
    const retrieved = new Set(["a", "b"]);
    const result = validateCitedChunkIds(["a", "z"], retrieved);
    assert.equal(result.valid, false);
    assert.deepEqual(result.invalidChunkIds, ["z"]);
  }
  console.log("PASS a cited chunkId that was never retrieved is flagged as invalid, never silently accepted");

  console.log("PASS citations.validate.test.ts");
}

run();
