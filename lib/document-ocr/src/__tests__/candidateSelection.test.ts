import assert from "node:assert/strict";
import { selectBestOcrCandidate, type OcrCandidateEvaluation } from "../candidateSelection";

function candidate(overrides: Partial<OcrCandidateEvaluation> & { name: string }): OcrCandidateEvaluation {
  return {
    generalScore: 100,
    financialScore: null,
    confidence: null,
    recoveredHighConfidenceCount: 0,
    arithmeticConflictCount: 0,
    zeroAmountSuspicionCount: 0,
    ...overrides,
  };
}

export function run(): void {
  // 1. A single candidate is always selected — no alternate pass required.
  {
    const result = selectBestOcrCandidate([candidate({ name: "original", generalScore: 40 })]);
    assert.equal(result.selectedCandidate, "original");
    assert.equal(result.candidateScores.length, 1);
  }
  console.log("PASS a single candidate is selected without comparison");

  // 2. A lower-confidence-but-financially-correct candidate must beat a higher-confidence-but-corrupted one.
  {
    const original = candidate({
      name: "original",
      generalScore: 100,
      financialScore: 20, // corrupted financial figures
      confidence: 92,
      zeroAmountSuspicionCount: 4,
    });
    const preprocessed = candidate({
      name: "preprocessed",
      generalScore: 95,
      financialScore: 90, // financial figures read correctly
      confidence: 61, // lower raw OCR confidence
      zeroAmountSuspicionCount: 0,
    });
    const result = selectBestOcrCandidate([original, preprocessed]);
    assert.equal(result.selectedCandidate, "preprocessed", "financial correctness must win over raw OCR confidence");
  }
  console.log("PASS lower-confidence-but-correct candidate beats higher-confidence-corrupted candidate");

  // 3. When combined scores tie, confidence is the next tie-breaker.
  {
    const a = candidate({ name: "a", generalScore: 90, financialScore: 90, confidence: 70 });
    const b = candidate({ name: "b", generalScore: 90, financialScore: 90, confidence: 95 });
    const result = selectBestOcrCandidate([a, b]);
    assert.equal(result.selectedCandidate, "b");
  }
  console.log("PASS confidence breaks ties after combined score");

  // 4. When score and confidence tie, more high-confidence recovered values wins.
  {
    const a = candidate({ name: "a", generalScore: 90, financialScore: 90, confidence: 80, recoveredHighConfidenceCount: 2 });
    const b = candidate({ name: "b", generalScore: 90, financialScore: 90, confidence: 80, recoveredHighConfidenceCount: 5 });
    const result = selectBestOcrCandidate([a, b]);
    assert.equal(result.selectedCandidate, "b");
  }
  console.log("PASS recovered high-confidence value count breaks remaining ties");

  // 5. When everything above ties, fewer arithmetic conflicts wins, then fewer suspicious zero amounts.
  {
    const a = candidate({ name: "a", generalScore: 90, financialScore: 90, confidence: 80, recoveredHighConfidenceCount: 3, arithmeticConflictCount: 2 });
    const b = candidate({ name: "b", generalScore: 90, financialScore: 90, confidence: 80, recoveredHighConfidenceCount: 3, arithmeticConflictCount: 0 });
    const result = selectBestOcrCandidate([a, b]);
    assert.equal(result.selectedCandidate, "b");
  }
  console.log("PASS arithmetic conflict count breaks ties before suspicious-zero count");

  // 6. candidateScores reports every candidate's own scores, unmodified, regardless of which one is selected.
  {
    const a = candidate({ name: "a", generalScore: 80, financialScore: 60, confidence: 50 });
    const b = candidate({ name: "b", generalScore: 95, financialScore: 95, confidence: 90 });
    const result = selectBestOcrCandidate([a, b]);
    assert.equal(result.selectedCandidate, "b");
    assert.deepEqual(result.candidateScores, [
      { name: "a", generalScore: 80, financialScore: 60, confidence: 50 },
      { name: "b", generalScore: 95, financialScore: 95, confidence: 90 },
    ]);
  }
  console.log("PASS candidateScores reports every candidate's scores for diagnostics");

  console.log("PASS candidateSelection.test.ts");
}

run();
