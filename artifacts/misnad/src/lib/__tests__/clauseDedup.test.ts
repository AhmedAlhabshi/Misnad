import assert from "node:assert/strict";
import type { ImportantClause } from "@/types/analysis";
import { deduplicateClauses } from "../clauseDedup";

function clause(overrides: Partial<ImportantClause> = {}): ImportantClause {
  return {
    title: "Clause",
    summary: "Summary text",
    riskLevel: null,
    evidence: null,
    plainExplanation: "Plain explanation text",
    ...overrides,
  };
}

export function run(): void {
  // Genuinely identical clauses (same title, same content) collapse to one.
  {
    const clauses = [
      clause({ title: "Late payment penalty", summary: "A 2% penalty applies for each day of delay.", plainExplanation: "Pay on time to avoid extra charges." }),
      clause({ title: "Late payment penalty", summary: "A 2% penalty applies for each day of delay.", plainExplanation: "Pay on time to avoid extra charges." }),
    ];
    const result = deduplicateClauses(clauses);
    assert.equal(result.length, 1, "two identical clauses must collapse to one");
  }
  console.log("PASS deduplicateClauses collapses genuinely identical clauses");

  // Same real concept restated with different wording still merges (title AND content both similar).
  {
    const clauses = [
      clause({
        title: "Late payment penalty",
        summary: "If payment is delayed, a penalty of 2% per day applies to the overdue amount.",
        plainExplanation: "You will be charged 2% daily if you pay late.",
      }),
      clause({
        title: "Penalty for late payment",
        summary: "A penalty of 2% per day applies to the overdue amount if payment is delayed.",
        plainExplanation: "You will be charged 2% daily if you pay late.",
      }),
    ];
    const result = deduplicateClauses(clauses);
    assert.equal(result.length, 1, "a reworded restatement of the same clause must still be merged");
  }
  console.log("PASS deduplicateClauses merges a reworded restatement of the same clause");

  // Two genuinely different clauses that merely share a topic word must NOT merge.
  {
    const clauses = [
      clause({
        title: "Monthly rent",
        summary: "The tenant shall pay 3,000 SAR in rent on the first day of each month.",
        plainExplanation: "Pay your rent by the 1st of every month.",
      }),
      clause({
        title: "Security deposit",
        summary: "The tenant shall pay a refundable security deposit of 5,000 SAR before occupancy.",
        plainExplanation: "You must pay a deposit before moving in; you get it back later.",
      }),
    ];
    const result = deduplicateClauses(clauses);
    assert.equal(result.length, 2, "two genuinely different clauses must never be merged just because they share a topic word");
  }
  console.log("PASS deduplicateClauses never merges genuinely different clauses sharing only a topic word");

  // Similar titles but unrelated content must not merge (title alone is too weak a signal).
  {
    const clauses = [
      clause({ title: "Payment terms", summary: "Rent is due monthly on the 1st.", plainExplanation: "Pay rent monthly." }),
      clause({ title: "Payment methods", summary: "Payments may be made by bank transfer or cheque.", plainExplanation: "You can pay by transfer or cheque." }),
    ];
    const result = deduplicateClauses(clauses);
    assert.equal(result.length, 2, "similar titles with unrelated content must not merge on title alone");
  }
  console.log("PASS deduplicateClauses requires both title and content similarity, never title alone");

  // Empty list and single-clause list are handled trivially.
  assert.deepEqual(deduplicateClauses([]), []);
  assert.equal(deduplicateClauses([clause()]).length, 1);
  console.log("PASS deduplicateClauses handles empty and single-item lists");

  console.log("PASS clauseDedup.test.ts");
}

run();
