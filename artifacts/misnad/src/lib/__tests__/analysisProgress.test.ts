import assert from "node:assert/strict";
import {
  ANALYSIS_PROGRESS_STAGES,
  MAIN_PROGRESS_STAGES,
  MAX_AUTO_COMPLETED_STAGES,
  OCR_PROGRESS_STAGES,
  computeMainStageStatuses,
  isFinalStageExtendedWait,
  mainStageLabel,
  mainStageStatusMessage,
  type MainStageStatus,
} from "../analysisProgress";

const STATUS_RANK: Record<MainStageStatus, number> = { pending: 0, active: 1, failed: 1, completed: 2 };

/** Converts a full 5-element status array into a comparable rank array, for monotonicity checks. */
function ranks(statuses: readonly MainStageStatus[]): number[] {
  return statuses.map((s) => STATUS_RANK[s]);
}

/** True if `next` never ranks lower than `prev` at any stage index (i.e. no regression from completed/active back to pending, or from completed back to active). */
function isMonotonicStep(prev: readonly MainStageStatus[], next: readonly MainStageStatus[]): boolean {
  const prevRanks = ranks(prev);
  const nextRanks = ranks(next);
  return prevRanks.every((r, i) => nextRanks[i]! >= r);
}

export function run(): void {
  assert.equal(MAIN_PROGRESS_STAGES.length, 5, "exactly 5 user-facing stages");
  console.log("PASS exactly 5 main stages are exposed");

  // --- AR/EN copy sanity: every main stage has non-empty label + status copy
  // in both languages, and the wording matches the target design's exact
  // 5-stage names -----------------------------------------------------------
  const expectedAr = [
    "تجهيز العقد",
    "قراءة وفهم العقد",
    "تحليل البنود والالتزامات",
    "إعداد التحليل المالي",
    "تجهيز التقرير",
  ];
  const expectedEn = [
    "Preparing the contract",
    "Reading and understanding the contract",
    "Analyzing clauses and obligations",
    "Preparing the financial analysis",
    "Finalizing the report",
  ];
  MAIN_PROGRESS_STAGES.forEach((stage, idx) => {
    assert.equal(mainStageLabel(stage, "ar"), expectedAr[idx]);
    assert.equal(mainStageLabel(stage, "en"), expectedEn[idx]);
    assert.ok(mainStageStatusMessage(stage, "ar").length > 0, "Arabic status message is non-empty");
    assert.ok(mainStageStatusMessage(stage, "en").length > 0, "English status message is non-empty");
  });
  console.log("PASS Arabic and English main-stage copy matches the target design");

  // --- Every one of the technical stages named in the mapping spec resolves
  // into exactly one of the 5 main stages (no orphaned technical work) ------
  assert.ok(
    ANALYSIS_PROGRESS_STAGES.some((s) => s.labelEn === "Calculating financial metrics"),
    "a dedicated financial-metrics technical stage exists so stage 4 has something real to map from",
  );
  console.log("PASS a financial-metrics technical stage exists in the underlying timer sequence");

  // --- computeMainStageStatuses: base-stage progression maps to the correct
  // main stage, strictly in order, without skipping or regressing ----------
  {
    const atStart = computeMainStageStatuses({ completedCount: 0, ocrStageIndex: -1, failed: false });
    assert.deepEqual(atStart, ["active", "pending", "pending", "pending", "pending"]);
  }
  {
    // completedCount=5 -> base stage index 5 ("Analyzing clauses and obligations") is current
    const atClauses = computeMainStageStatuses({ completedCount: 5, ocrStageIndex: -1, failed: false });
    assert.deepEqual(atClauses, ["completed", "completed", "active", "pending", "pending"]);
  }
  {
    // completedCount=6 -> base stage index 6 ("Calculating financial metrics") is current
    const atFinancial = computeMainStageStatuses({ completedCount: 6, ocrStageIndex: -1, failed: false });
    assert.deepEqual(atFinancial, ["completed", "completed", "completed", "active", "pending"]);
  }
  {
    // completedCount=7 -> "Preparing summary" -> main stage 4 (Finalizing the report)
    const atSummary = computeMainStageStatuses({ completedCount: 7, ocrStageIndex: -1, failed: false });
    assert.deepEqual(atSummary, ["completed", "completed", "completed", "completed", "active"]);
  }
  {
    // completedCount reaching the full stage count only happens after the real
    // server response arrives -- at that point every main stage is completed.
    const allDone = computeMainStageStatuses({
      completedCount: ANALYSIS_PROGRESS_STAGES.length,
      ocrStageIndex: -1,
      failed: false,
    });
    assert.deepEqual(allDone, ["completed", "completed", "completed", "completed", "completed"]);
  }
  console.log("PASS main stage statuses follow the real completedCount timer, strictly in order");

  // --- REGRESSION: OCR/extended-wait ticks must NEVER pull progress backward
  // below wherever completedCount has already (monotonically) reached. A
  // previous version let `ocrStageIndex >= 0` *override* the current index
  // outright (forcing it back down to "Reading and understanding" — main
  // index 1), which caused the live bug: once completedCount reached its cap
  // (mapping to a later main stage), the arrival of OCR ticks snapped
  // progress backward, un-completing already-completed stages. Fixed:
  // ocrStageIndex may only ever raise the floor via Math.max, never lower it.
  {
    // completedCount is pinned at MAX_AUTO_COMPLETED_STAGES (maps to main
    // index 4, "Finalizing the report") by the time OCR ticks can ever start.
    const duringOcr = computeMainStageStatuses({
      completedCount: MAX_AUTO_COMPLETED_STAGES,
      ocrStageIndex: 0,
      failed: false,
    });
    assert.deepEqual(
      duringOcr,
      ["completed", "completed", "completed", "completed", "active"],
      "OCR starting must not regress stages 0-3 back to pending, nor stage 4 back to a different active stage",
    );
  }
  {
    const lateInOcr = computeMainStageStatuses({
      completedCount: MAX_AUTO_COMPLETED_STAGES,
      ocrStageIndex: OCR_PROGRESS_STAGES.length - 1,
      failed: false,
    });
    // Even on the very last OCR sub-step, every already-completed stage stays
    // completed and the final stage remains the one and only active stage.
    assert.deepEqual(lateInOcr, ["completed", "completed", "completed", "completed", "active"]);
  }
  console.log("PASS OCR/extended-wait ticks never regress an already-completed stage back to active or pending");

  // --- Defensive: even for a (completedCount, ocrStageIndex) combination the
  // real component's timer never actually produces (ocrStageIndex only ever
  // starts advancing once completedCount is already pinned at its cap), the
  // pure function still behaves sanely — the floor from OCR never exceeds
  // what completedCount alone would already show at an earlier stage --------
  {
    const hypothetical = computeMainStageStatuses({ completedCount: 1, ocrStageIndex: 2, failed: false });
    assert.deepEqual(hypothetical, ["completed", "active", "pending", "pending", "pending"]);
  }
  console.log("PASS the Math.max floor behaves correctly even for input combinations the real timer never produces");

  // --- MONOTONICITY: for every possible (completedCount, ocrStageIndex) pair
  // reachable by the real timer, in the real order the timer can produce
  // them, the derived statuses never regress step over step -----------------
  {
    let previous = computeMainStageStatuses({ completedCount: 0, ocrStageIndex: -1, failed: false });
    for (let count = 1; count <= MAX_AUTO_COMPLETED_STAGES; count++) {
      const next = computeMainStageStatuses({ completedCount: count, ocrStageIndex: -1, failed: false });
      assert.ok(isMonotonicStep(previous, next), `completedCount ${count - 1}->${count} must never regress any stage`);
      previous = next;
    }
    for (let ocr = 0; ocr < OCR_PROGRESS_STAGES.length; ocr++) {
      const next = computeMainStageStatuses({ completedCount: MAX_AUTO_COMPLETED_STAGES, ocrStageIndex: ocr, failed: false });
      assert.ok(isMonotonicStep(previous, next), `ocrStageIndex ${ocr - 1}->${ocr} must never regress any stage`);
      previous = next;
    }
    // Finally, the real success signal jumps completedCount to the full length.
    const final = computeMainStageStatuses({ completedCount: ANALYSIS_PROGRESS_STAGES.length, ocrStageIndex: OCR_PROGRESS_STAGES.length - 1, failed: false });
    assert.ok(isMonotonicStep(previous, final), "the final success jump must never regress any stage");
    assert.deepEqual(final, ["completed", "completed", "completed", "completed", "completed"]);
  }
  console.log("PASS progress is strictly monotonic across the entire realistic tick sequence, including a long OCR/backend wait, through to real success");

  // --- Once all five stages are completed (real success), they stay
  // completed regardless of any stale ocrStageIndex value still lingering
  // in state (e.g. before the component unmounts/navigates away) -----------
  {
    for (const staleOcrIndex of [-1, 0, OCR_PROGRESS_STAGES.length - 1]) {
      const allDone = computeMainStageStatuses({
        completedCount: ANALYSIS_PROGRESS_STAGES.length,
        ocrStageIndex: staleOcrIndex,
        failed: false,
      });
      assert.deepEqual(allDone, ["completed", "completed", "completed", "completed", "completed"]);
    }
  }
  console.log("PASS once all five stages are completed, they remain completed regardless of the lingering ocrStageIndex value");

  // --- The extended-wait signal is a pure function of ocrStageIndex only,
  // and never itself implies anything about stage completion --------------
  assert.equal(isFinalStageExtendedWait(-1), false);
  assert.equal(isFinalStageExtendedWait(0), true);
  assert.equal(isFinalStageExtendedWait(OCR_PROGRESS_STAGES.length - 1), true);
  console.log("PASS isFinalStageExtendedWait is a simple, pure signal decoupled from stage completion");

  // --- When a request never needed OCR at all (ocrStageIndex stays -1 for
  // the whole run), no OCR-only main stage is ever visited differently -- the
  // reading stage completes purely from the base timer, exactly as a native
  // text contract would ------------------------------------------------------
  {
    const noOcrNeeded = computeMainStageStatuses({ completedCount: 5, ocrStageIndex: -1, failed: false });
    assert.equal(noOcrNeeded[1], "completed", "reading stage completes on its own without any OCR involvement");
  }
  console.log("PASS a contract that never needed OCR completes the reading stage without any OCR-only step");

  // --- A failure freezes the currently-active main stage as failed, and
  // every later stage stays pending (never marked completed or active) -----
  {
    const failedAtReading = computeMainStageStatuses({ completedCount: 2, ocrStageIndex: -1, failed: true });
    assert.deepEqual(failedAtReading, ["completed", "failed", "pending", "pending", "pending"]);
  }
  console.log("PASS a failure marks only the currently active stage as failed, leaving later stages pending");

  console.log("PASS analysisProgress.test.ts");
}

run();
