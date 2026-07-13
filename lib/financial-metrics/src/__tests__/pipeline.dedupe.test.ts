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

  console.log("PASS pipeline.dedupe.test.ts");
}

run();
