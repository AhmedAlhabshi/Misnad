import assert from "node:assert/strict";
import { calculateFinancialMetrics } from "../engine";
import {
  autoFinanceDetails,
  baseContractUnderstanding,
  fee,
  financialObligation,
  insuranceDetails,
  leaseDetails,
  penalty,
} from "./fixtures/contractUnderstanding";

/**
 * End-to-end tests for the three Milestone 5.6 correction-pass fixes:
 * (1) lease/security-deposit refundability is never assumed, (2) currency
 * is never backfilled by majority vote, (3) `calculatedKnownCost` never
 * includes conditional/contingent amounts.
 */
export function run(): void {
  // ---------------------------------------------------------------------
  // Fix 1: deposit refundability (lease security deposit and generic deposits).
  // ---------------------------------------------------------------------

  // 1a. Explicitly refundable deposit (via generic financialObligations text)
  //     must be excluded from guaranteed cost.
  {
    const withRefundable = baseContractUnderstanding(leaseDetails({ monthlyRent: 2000, leaseTermMonths: 12 }));
    withRefundable.financialObligations = [
      financialObligation({ description: "Refundable security deposit", amount: 5000, currency: "SAR", frequency: "one time" }),
    ];
    const withoutDeposit = baseContractUnderstanding(leaseDetails({ monthlyRent: 2000, leaseTermMonths: 12 }));
    // Same currency anchor as `withRefundable`, minus the deposit itself, so the two scenarios
    // differ only in the deposit's presence (both fully resolve their currency to SAR).
    withoutDeposit.financialObligations = [
      financialObligation({ description: "Placeholder currency anchor", amount: 0, currency: "SAR", frequency: "one time" }),
    ];
    const baseline = calculateFinancialMetrics(withoutDeposit);
    const result = calculateFinancialMetrics(withRefundable);
    assert.equal(
      result.totalCost.calculatedCoreObligations.value,
      baseline.totalCost.calculatedCoreObligations.value,
      "an explicitly refundable deposit must not add to guaranteed core cost",
    );
  }

  // 1b. Explicitly non-refundable deposit must be included in guaranteed cost.
  {
    const input = baseContractUnderstanding(leaseDetails({ monthlyRent: 2000, leaseTermMonths: 12 }));
    input.financialObligations = [
      financialObligation({ description: "Non-refundable security deposit", amount: 5000, currency: "SAR", frequency: "one time" }),
    ];
    const result = calculateFinancialMetrics(input);
    // 2000 * 12 (recurring) + 5000 (non-refundable deposit) = 29000.
    assert.equal(result.totalCost.calculatedCoreObligations.value, 29000);
  }

  // 1c. Deposit with unknown refundability (the lease `typeDetails.securityDeposit` field,
  //     which carries no accompanying text) must NOT be assumed refundable — it stays out of
  //     guaranteed cost, but is flagged via an excluded-value entry, not silently dropped.
  {
    const input = baseContractUnderstanding(leaseDetails({ monthlyRent: 2000, securityDeposit: 5000, leaseTermMonths: 12 }));
    // A currency anchor (mandatory is left unstated, so it does not itself add to guaranteed cost).
    input.fees = [fee({ description: "Lease registration fee", amount: 0, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    // Only the recurring rent (2000 * 12 = 24000) counts — the deposit does not.
    assert.equal(result.totalCost.calculatedCoreObligations.value, 24000);
    assert.ok(
      result.calculationMetadata.excludedValues.some(
        (excluded) => excluded.reasonCode === "deposit_refundability_unresolved" && excluded.value === 5000,
      ),
      "an unresolved-refundability deposit must be flagged, not silently excluded without a trace",
    );
    // It still contributes to upfront cash exposure, since it is payable upfront regardless of refundability.
    assert.equal(result.exposure.upfrontExposure.value, 5000);
  }

  // 1d. Unknown refundability must not be silently conflated with confirmed-refundable: the
  //     numeric exclusion is the same, but only the unknown case leaves an excluded-value trace.
  {
    const unknownInput = baseContractUnderstanding(leaseDetails({ monthlyRent: 2000, securityDeposit: 5000, leaseTermMonths: 12 }));
    unknownInput.fees = [fee({ description: "Lease registration fee", amount: 0, currency: "SAR", isRecurring: false })];
    const unknownResult = calculateFinancialMetrics(unknownInput);

    const confirmedRefundableInput = baseContractUnderstanding(leaseDetails({ monthlyRent: 2000, leaseTermMonths: 12 }));
    confirmedRefundableInput.financialObligations = [
      financialObligation({ description: "Refundable security deposit", amount: 5000, currency: "SAR", frequency: "one time" }),
    ];
    const confirmedRefundableResult = calculateFinancialMetrics(confirmedRefundableInput);

    assert.equal(unknownResult.totalCost.calculatedCoreObligations.value, confirmedRefundableResult.totalCost.calculatedCoreObligations.value);
    assert.equal(
      unknownResult.calculationMetadata.excludedValues.length > 0,
      true,
      "the unresolved case must leave a trace",
    );
    assert.equal(
      confirmedRefundableResult.calculationMetadata.excludedValues.some((e) => e.reasonCode === "deposit_refundability_unresolved"),
      false,
      "a confidently-resolved refundable deposit must not be flagged as unresolved — the two cases must not be conflated",
    );
  }

  // ---------------------------------------------------------------------
  // Fix 2: currency is never backfilled by majority vote.
  // ---------------------------------------------------------------------

  // 2a. One-currency contract: typeDetails amounts (no currency of their own) safely backfill.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500, loanTermMonths: 12 }));
    input.fees = [fee({ description: "Documentation fee", amount: 100, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    assert.equal(result.currency, "SAR");
    assert.equal(result.totalCost.calculatedBaseCost.value, 80000, "the currency-less principal must backfill to the one unique currency present");
  }

  // 2b. 10 SAR candidates plus 1 USD candidate must not backfill SAR onto currency-less values.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500, loanTermMonths: 12 }));
    input.financialObligations = Array.from({ length: 10 }, (_, i) =>
      financialObligation({ description: `Fee item ${i}`, amount: 10, currency: "SAR", frequency: "one time" }),
    );
    input.fees = [fee({ description: "International wire fee", amount: 5, currency: "USD", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    assert.equal(result.currency, null, "10-to-1 is still two distinct currencies — never resolved to the majority");
    assert.equal(result.totalCost.calculatedBaseCost.status, "unavailable", "the currency-less principal must not be backfilled");
  }

  // 2c. A tie (one SAR, one USD candidate) must not backfill either.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000 }));
    input.financialObligations = [
      financialObligation({ description: "Item A", amount: 100, currency: "SAR", frequency: "one time" }),
      financialObligation({ description: "Item B", amount: 100, currency: "USD", frequency: "one time" }),
    ];
    const result = calculateFinancialMetrics(input);
    assert.equal(result.currency, null);
  }

  // 2d. No known currency anywhere must not default to SAR (or anything else).
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500 }));
    const result = calculateFinancialMetrics(input);
    assert.equal(result.currency, null);
    assert.equal(result.totalCost.calculatedBaseCost.status, "unavailable");
  }

  // 2e. Mixed-currency consolidated ratios remain unavailable.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000 }));
    input.financialObligations = [
      financialObligation({ description: "Item A", amount: 100, currency: "SAR", frequency: "one time" }),
      financialObligation({ description: "Item B", amount: 100, currency: "USD", frequency: "one time" }),
    ];
    const result = calculateFinancialMetrics(input);
    assert.equal(result.ratios.feesToBaseCost.status, "unavailable");
    assert.equal(result.ratios.upfrontPaymentToBaseCost.status, "unavailable");
    assert.equal(result.ratios.totalCostIncrease.status, "unavailable");
  }

  // ---------------------------------------------------------------------
  // Fix 3: calculatedKnownCost never includes conditional/contingent amounts.
  // ---------------------------------------------------------------------

  // 3a. A known numeric late penalty must be excluded from guaranteed/core AND known cost.
  {
    const withoutPenalty = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500, loanTermMonths: 12 }));
    withoutPenalty.fees = [fee({ description: "Documentation fee", amount: 0, currency: "SAR", isRecurring: false })];
    const baseline = calculateFinancialMetrics(withoutPenalty);

    const withPenalty = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500, loanTermMonths: 12 }));
    withPenalty.fees = [fee({ description: "Documentation fee", amount: 0, currency: "SAR", isRecurring: false })];
    withPenalty.penalties = [penalty({ description: "Late payment penalty", amount: 5000, currency: "SAR", condition: "if paid late" })];
    const result = calculateFinancialMetrics(withPenalty);

    assert.equal(result.totalCost.calculatedCoreObligations.value, baseline.totalCost.calculatedCoreObligations.value);
    assert.equal(result.totalCost.calculatedKnownCost.value, baseline.totalCost.calculatedKnownCost.value, "calculatedKnownCost must equal calculatedCoreObligations — never inflated by a known conditional penalty");
  }

  // 3b. A cancellation fee (conditional) must be excluded from the normal-path total.
  {
    const withoutFee = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500, loanTermMonths: 12 }));
    withoutFee.fees = [fee({ description: "Documentation fee", amount: 0, currency: "SAR", isRecurring: false })];
    const baseline = calculateFinancialMetrics(withoutFee);

    const withCancellationFee = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500, loanTermMonths: 12 }));
    withCancellationFee.fees = [fee({ description: "Documentation fee", amount: 0, currency: "SAR", isRecurring: false })];
    withCancellationFee.penalties = [
      penalty({ description: "Cancellation fee", amount: 2000, currency: "SAR", condition: "if the customer cancels early" }),
    ];
    const result = calculateFinancialMetrics(withCancellationFee);

    assert.equal(result.penalties.items[0].type, "cancellation");
    assert.equal(result.totalCost.calculatedKnownCost.value, baseline.totalCost.calculatedKnownCost.value);
  }

  // 3c. An insurance deductible must be excluded from both the premium and guaranteed cost.
  {
    const input = baseContractUnderstanding(insuranceDetails({ premiumAmount: 500, premiumFrequency: "monthly", deductible: 3000 }));
    input.fees = [fee({ description: "Policy issuance fee", amount: 50, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    assert.equal(result.recurringCommitment.monthlyEquivalent.value, 500, "the deductible must never be folded into the premium");
    assert.notEqual(result.totalCost.calculatedCoreObligations.value, 3000);
    assert.equal(result.exposure.contingentExposure.value, 3000, "the deductible belongs in contingent exposure");
  }

  // 3d. Conditional amounts remain fully visible in contingent exposure and fee/penalty collections
  //     even though they are excluded from guaranteed/known cost.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500, loanTermMonths: 12 }));
    input.penalties = [penalty({ description: "Early termination fee", amount: 4000, currency: "SAR", condition: "if terminated early" })];
    const result = calculateFinancialMetrics(input);
    assert.equal(result.penalties.items[0].conditional, true);
    assert.equal(result.penalties.totalKnownPenalties.value, 4000, "the penalty remains fully visible in the penalty collection");
    assert.equal(result.exposure.contingentExposure.value, 4000, "the penalty remains fully visible in contingent exposure");
    assert.equal(result.totalCost.calculatedKnownCost.value, result.totalCost.calculatedCoreObligations.value, "calculatedKnownCost must equal calculatedCoreObligations, not core + the 4,000 conditional penalty");
  }

  // 3e. Normal-path ratios are unchanged when only a conditional penalty is added.
  {
    const withoutPenalty = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500, loanTermMonths: 12 }));
    withoutPenalty.fees = [fee({ description: "Documentation fee", amount: 100, currency: "SAR", isRecurring: false })];
    const baseline = calculateFinancialMetrics(withoutPenalty);

    const withPenalty = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500, loanTermMonths: 12 }));
    withPenalty.fees = [fee({ description: "Documentation fee", amount: 100, currency: "SAR", isRecurring: false })];
    withPenalty.penalties = [penalty({ description: "Default penalty", amount: 6000, currency: "SAR", condition: "upon default" })];
    const result = calculateFinancialMetrics(withPenalty);

    assert.equal(result.ratios.feesToBaseCost.value, baseline.ratios.feesToBaseCost.value);
    assert.equal(result.ratios.totalCostIncrease.value, baseline.ratios.totalCostIncrease.value, "totalCostIncrease (finance-cost ratio) must not move when only a conditional penalty is added");
    assert.equal(result.ratios.upfrontPaymentToBaseCost.value, baseline.ratios.upfrontPaymentToBaseCost.value);
  }

  console.log("PASS engine.correctionPass.test.ts");
}

run();
