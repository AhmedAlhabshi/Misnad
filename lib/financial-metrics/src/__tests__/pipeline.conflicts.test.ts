import assert from "node:assert/strict";
import type { Candidate } from "../pipeline/candidates";
import {
  backfillCandidateCurrencies,
  describeCurrencyDistribution,
  resolveConflicts,
  resolveContractCurrency,
} from "../pipeline/conflicts";

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    targetKind: "obligation",
    label: "Monthly installment",
    amountValue: 1500,
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
    evidence: "Monthly installment",
    confidence: "medium",
    obligationType: "recurring_payment",
    semanticRole: "unknown",
    context: "normal_contract_path",
    ...overrides,
  };
}

export function run(): void {
  // The spec's own example: "monthly installment" reported as 1,500 in one place and 1,750 in another.
  {
    const a = candidate({ amountValue: 1500, sourceKind: "type_details", sourceField: "typeDetails.monthlyInstallment", confidence: "high" });
    const b = candidate({ amountValue: 1750, sourceKind: "financial_obligation", sourceField: "financialObligations[0]" });
    const { candidates, conflicts } = resolveConflicts([a, b]);

    assert.equal(candidates.length, 1, "a conflict resolves to exactly one winner");
    assert.equal(candidates[0].amountValue, 1500, "the higher-priority source (type_details) must win");
    assert.notEqual(candidates[0].amountValue, (1500 + 1750) / 2, "the values must never be averaged");
    assert.equal(conflicts.length, 1);
    assert.deepEqual(conflicts[0].values, [1500, 1750], "rejected alternative values must be retained in the conflict record");
    assert.ok(conflicts[0].sourceFields.includes("typeDetails.monthlyInstallment"));
    assert.ok(conflicts[0].sourceFields.includes("financialObligations[0]"));
  }

  // Contract-specific structured field beats an extracted number.
  {
    const structured = candidate({ amountValue: 1500, sourceKind: "type_details", sourceField: "typeDetails.monthlyInstallment", confidence: "high" });
    const extracted = candidate({ amountValue: 1600, sourceKind: "extracted_number", sourceField: "extractedNumbers[3]", confidence: "low" });
    const { candidates } = resolveConflicts([structured, extracted]);
    assert.equal(candidates[0].sourceKind, "type_details");
  }

  // Explicit financial obligation beats a generic extracted number.
  {
    const obligation = candidate({ amountValue: 1500, sourceKind: "financial_obligation", sourceField: "financialObligations[0]" });
    const extracted = candidate({ amountValue: 1700, sourceKind: "extracted_number", sourceField: "extractedNumbers[1]", confidence: "low" });
    const { candidates } = resolveConflicts([obligation, extracted]);
    assert.equal(candidates[0].sourceKind, "financial_obligation");
  }

  // Higher confidence wins within an equal source-priority tier.
  {
    const highConfidence = candidate({ amountValue: 1500, sourceField: "financialObligations[0]", confidence: "high" });
    const lowConfidence = candidate({ amountValue: 1650, sourceField: "financialObligations[1]", confidence: "low" });
    const { candidates } = resolveConflicts([highConfidence, lowConfidence]);
    assert.equal(candidates[0].amountValue, 1500);
  }

  // A genuinely-tied conflict (same source kind, same confidence, same evidence length) must still resolve deterministically, never randomly.
  {
    const first = candidate({ amountValue: 1500, sourceField: "financialObligations[0]", evidence: "same" });
    const second = candidate({ amountValue: 1600, sourceField: "financialObligations[1]", evidence: "same" });
    const runOnce = resolveConflicts([first, second]).candidates[0].amountValue;
    const runTwice = resolveConflicts([second, first]).candidates[0].amountValue;
    assert.equal(runOnce, runTwice, "the same tied inputs must always resolve to the same winner regardless of input order");
  }

  // Two different fees that merely share type/currency/frequency but have different labels must NOT be treated as a conflict.
  {
    const maintenance = candidate({
      targetKind: "fee",
      feeType: "maintenance",
      label: "Monthly maintenance fee",
      evidence: "Monthly maintenance fee",
      amountValue: 50,
      frequency: "monthly",
      sourceKind: "fee_item",
      sourceField: "fees[0]",
    });
    const service = candidate({
      targetKind: "fee",
      feeType: "maintenance",
      label: "Monthly service fee",
      evidence: "Monthly service fee",
      amountValue: 30,
      frequency: "monthly",
      sourceKind: "fee_item",
      sourceField: "fees[1]",
    });
    const { candidates, conflicts } = resolveConflicts([maintenance, service]);
    assert.equal(candidates.length, 2, "two genuinely different fees must not be collapsed into a conflict");
    assert.equal(conflicts.length, 0);
  }

  // Special-value conflicts group by key alone (labels can differ).
  {
    const fromTypeDetails = candidate({
      targetKind: "special",
      specialKey: "principal",
      label: "Financed amount",
      evidence: "Financed amount",
      amountValue: 80000,
      sourceKind: "type_details",
      sourceField: "typeDetails.financedAmount",
      confidence: "high",
    });
    const fromGenericText = candidate({
      targetKind: "special",
      specialKey: "principal",
      label: "Loan Principal Amount",
      evidence: "Loan Principal Amount",
      amountValue: 82000,
      sourceKind: "financial_obligation",
      sourceField: "financialObligations[2]",
    });
    const { candidates, conflicts } = resolveConflicts([fromTypeDetails, fromGenericText]);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].amountValue, 80000);
    assert.equal(conflicts.length, 1);
  }

  // resolveContractCurrency: backfill is allowed ONLY when exactly one unique currency
  // exists across the whole contract — this is never a majority/plurality vote.
  {
    // 1. One-currency contract: the single unique currency resolves cleanly.
    const oneCurrency = [
      candidate({ currency: "SAR", sourceField: "a" }),
      candidate({ currency: "SAR", sourceField: "b" }),
      candidate({ currency: "SAR", sourceField: "c" }),
    ];
    assert.equal(resolveContractCurrency(oneCurrency), "SAR");

    // 2. 10 SAR candidates plus 1 USD candidate must NOT resolve to SAR (no majority vote).
    const tenSarOneUsd = [
      ...Array.from({ length: 10 }, (_, i) => candidate({ currency: "SAR", sourceField: `sar-${i}` })),
      candidate({ currency: "USD", sourceField: "usd-0" }),
    ];
    assert.equal(resolveContractCurrency(tenSarOneUsd), null, "10-to-1 is still two distinct currencies, not a resolvable single currency");

    // 3. A genuine tie must not resolve either.
    const tied = [candidate({ currency: "SAR", sourceField: "a" }), candidate({ currency: "USD", sourceField: "b" })];
    assert.equal(resolveContractCurrency(tied), null, "a genuine currency tie must resolve to null, never a default");

    // 4. No known currency anywhere must not default to SAR (or anything else).
    assert.equal(resolveContractCurrency([candidate({ currency: null })]), null);
    assert.equal(resolveContractCurrency([]), null);
  }

  // describeCurrencyDistribution is purely informational and must never influence resolveContractCurrency.
  {
    const tenSarOneUsd = [
      ...Array.from({ length: 10 }, (_, i) => candidate({ currency: "SAR", sourceField: `sar-${i}` })),
      candidate({ currency: "USD", sourceField: "usd-0" }),
    ];
    const distribution = describeCurrencyDistribution(tenSarOneUsd);
    assert.ok(distribution?.includes("SAR: 10"));
    assert.ok(distribution?.includes("USD: 1"));
    // Still null — the distribution text must never feed back into resolution.
    assert.equal(resolveContractCurrency(tenSarOneUsd), null);
    assert.equal(describeCurrencyDistribution([candidate({ currency: "SAR" })]), null, "a single-currency contract has nothing ambiguous to describe");
  }

  // backfillCandidateCurrencies only fills currency-less amounts when the contract currency is unambiguous.
  {
    const typeDetailsAmount = candidate({ currency: null, amountValue: 500, sourceField: "typeDetails.x" });
    const backfilled = backfillCandidateCurrencies([typeDetailsAmount], "SAR");
    assert.equal(backfilled[0].currency, "SAR");

    const notBackfilled = backfillCandidateCurrencies([typeDetailsAmount], null);
    assert.equal(notBackfilled[0].currency, null, "no contract currency means nothing is fabricated");
  }

  console.log("PASS pipeline.conflicts.test.ts");
}

run();
