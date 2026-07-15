import assert from "node:assert/strict";
import type { Candidate } from "../pipeline/candidates";
import { deduplicateCandidates } from "../pipeline/dedupe";

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    targetKind: "obligation",
    label: "Item",
    amountValue: 1000,
    currency: "SAR",
    percentageValue: null,
    frequency: "monthly",
    numberOfPayments: null,
    startDate: null,
    endDate: null,
    mandatory: true,
    conditional: null,
    refundable: null,
    paymentTiming: null,
    calculationBase: null,
    trigger: null,
    sourceKind: "financial_obligation",
    sourceField: "financialObligations[0]",
    evidence: "Item",
    confidence: "medium",
    semanticRole: "unknown",
    context: "normal_contract_path",
    ...overrides,
  };
}

export function run(): void {
  // Same installment reported from two locations (type_details + financialObligations) — must collapse to one, preferring type_details.
  {
    const typeDetailsVersion = candidate({
      obligationType: "recurring_payment",
      sourceKind: "type_details",
      sourceField: "typeDetails.monthlyInstallment",
      confidence: "high",
      evidence: "Monthly installment",
      label: "Monthly installment",
    });
    const financialObligationVersion = candidate({
      obligationType: "recurring_payment",
      sourceKind: "financial_obligation",
      sourceField: "financialObligations[0]",
      label: "Monthly installment",
      evidence: "Monthly installment",
    });
    const { candidates, duplicatesRemovedCount } = deduplicateCandidates([typeDetailsVersion, financialObligationVersion]);
    assert.equal(candidates.length, 1, "an exact duplicate across two locations must collapse to one item");
    assert.equal(duplicatesRemovedCount, 1);
    assert.equal(candidates[0].sourceKind, "type_details", "the more structured source must be retained");
  }

  // Same fee with minor description differences (same classification/amount/currency/frequency) — must dedupe.
  {
    const a = candidate({
      targetKind: "fee",
      feeType: "administration",
      label: "Admin Fee",
      evidence: "Admin Fee",
      frequency: "one_time",
      mandatory: true,
      sourceKind: "fee_item",
      sourceField: "fees[0]",
    });
    const b = candidate({
      targetKind: "fee",
      feeType: "administration",
      label: "Administration Fee",
      evidence: "Administration Fee",
      frequency: "one_time",
      mandatory: true,
      sourceKind: "fee_item",
      sourceField: "fees[1]",
    });
    const { candidates } = deduplicateCandidates([a, b]);
    assert.equal(candidates.length, 1, "the same fee described slightly differently must not be double-counted");
  }

  // Same amount but different categories — must NOT merge (e.g. SAR 1,000 installment vs SAR 1,000 admin fee).
  {
    const installment = candidate({ obligationType: "recurring_payment", label: "Monthly installment" });
    const adminFee = candidate({
      targetKind: "fee",
      feeType: "administration",
      label: "Administration fee",
      sourceKind: "fee_item",
      sourceField: "fees[0]",
      frequency: "one_time",
    });
    const { candidates } = deduplicateCandidates([installment, adminFee]);
    assert.equal(candidates.length, 2, "a same-amount installment and admin fee are not duplicates and must both be kept");
  }

  // Same amount but different frequencies — must not merge.
  {
    const monthly = candidate({ obligationType: "recurring_payment", frequency: "monthly", sourceField: "a" });
    const annual = candidate({ obligationType: "recurring_payment", frequency: "annual", sourceField: "b" });
    const { candidates } = deduplicateCandidates([monthly, annual]);
    assert.equal(candidates.length, 2);
  }

  // Same amount but different currencies — must not merge.
  {
    const sar = candidate({ currency: "SAR", sourceField: "a" });
    const usd = candidate({ currency: "USD", sourceField: "b" });
    const { candidates } = deduplicateCandidates([sar, usd]);
    assert.equal(candidates.length, 2);
  }

  // Best-evidence selection: same everything, one has richer/longer evidence text at equal source/confidence tiers.
  {
    const shortEvidence = candidate({
      sourceField: "financialObligations[0]",
      evidence: "Fee",
      label: "Fee",
    });
    const longEvidence = candidate({
      sourceField: "financialObligations[1]",
      evidence: "Monthly maintenance fee due on the 1st of each month",
      label: "Fee",
    });
    const { candidates } = deduplicateCandidates([shortEvidence, longEvidence]);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].evidence, "Monthly maintenance fee due on the 1st of each month");
  }

  // No double counting: duplicates must never be summed.
  {
    const a = candidate({ amountValue: 500, sourceField: "a" });
    const b = candidate({ amountValue: 500, sourceField: "b" });
    const { candidates } = deduplicateCandidates([a, b]);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].amountValue, 500, "duplicates must never be summed into 1000");
  }

  // Bilingual duplicate (Milestone 5.6C): the same real-world obligation
  // reported in Arabic and English must collapse to one, even when their
  // `mandatory` inference differs purely because one description happened to
  // state it explicitly and the other didn't — an information gap, not a
  // genuine disagreement.
  {
    const arabic = candidate({
      obligationType: "upfront_payment",
      label: "الدفعة المقدمة",
      evidence: "الدفعة المقدمة",
      frequency: "one_time",
      mandatory: null,
      sourceField: "financialObligations[0]",
    });
    const english = candidate({
      obligationType: "upfront_payment",
      label: "Down payment",
      evidence: "Down payment",
      frequency: "one_time",
      mandatory: true,
      sourceField: "financialObligations[1]",
    });
    const { candidates, duplicatesRemovedCount } = deduplicateCandidates([arabic, english]);
    assert.equal(candidates.length, 1, "the Arabic and English reports of the same obligation must collapse to one");
    assert.equal(duplicatesRemovedCount, 1);
  }

  // An explicit mandatory/conditional *contradiction* (not just one side
  // being unstated) must still block a merge — this is real disagreement,
  // not an information gap.
  {
    const statedMandatory = candidate({ obligationType: "upfront_payment", label: "Down payment", mandatory: true, sourceField: "a" });
    const statedOptional = candidate({ obligationType: "upfront_payment", label: "Down payment", mandatory: false, sourceField: "b" });
    const { candidates } = deduplicateCandidates([statedMandatory, statedOptional]);
    assert.equal(candidates.length, 2, "an explicit mandatory-vs-optional contradiction must not be merged away");
  }

  // Different due dates (timing) alone block a merge, even when the labels
  // are identical (so the generic-type title-guard would otherwise allow
  // it) — two differing explicit dates are evidence of genuinely separate
  // occurrences, not restatements of the same one.
  {
    const first = candidate({ label: "Service fee", evidence: "Service fee", startDate: "2026-03-01", sourceField: "a" });
    const second = candidate({ label: "Service fee", evidence: "Service fee", startDate: "2026-09-01", sourceField: "b" });
    const { candidates } = deduplicateCandidates([first, second]);
    assert.equal(candidates.length, 2, "different due dates are evidence of genuinely separate obligations");
  }

  // Generic-type safety net: two candidates with an unclassified ("unknown") category,
  // the same amount/frequency/currency, but completely unrelated labels/evidence must
  // not be merged just because their structured fields happen to coincide.
  {
    const first = candidate({ obligationType: "unknown", label: "Vehicle registration transfer charge", evidence: "Vehicle registration transfer charge", sourceField: "a" });
    const second = candidate({ obligationType: "unknown", label: "Courier delivery surcharge", evidence: "Courier delivery surcharge", sourceField: "b" });
    const { candidates } = deduplicateCandidates([first, second]);
    assert.equal(candidates.length, 2, "unclassified items with unrelated titles must not be merged on amount alone");
  }

  console.log("PASS pipeline.dedupe.test.ts");
}

run();
