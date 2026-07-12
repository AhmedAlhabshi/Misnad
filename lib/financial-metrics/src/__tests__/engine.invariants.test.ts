import assert from "node:assert/strict";
import { calculateFinancialMetrics } from "../engine";
import { financialMetricsSchema } from "../financialMetrics";
import {
  autoFinanceDetails,
  baseContractUnderstanding,
  creditCardDetails,
  fee,
  financialObligation,
  insuranceDetails,
  penalty,
} from "./fixtures/contractUnderstanding";

function collectAllNumbers(value: unknown, out: number[]): void {
  if (typeof value === "number") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAllNumbers(item, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) collectAllNumbers(nested, out);
  }
}

export function run(): void {
  // 1. The engine never invents a monetary value: an amount with no currency anywhere in the document must be reported unavailable, not assigned a guessed currency/value.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000 }));
    const result = calculateFinancialMetrics(input);
    assert.equal(result.totalCost.calculatedBaseCost.status, "unavailable");
    assert.equal(result.totalCost.calculatedBaseCost.value, null);
  }

  // 2. The engine never returns NaN or Infinity anywhere in the output.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500 }));
    input.fees = [fee({ description: "Zero-principal edge case fee", amount: 0, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    const numbers: number[] = [];
    collectAllNumbers(result, numbers);
    assert.ok(numbers.length > 0);
    for (const value of numbers) {
      assert.ok(Number.isFinite(value), `found a non-finite number (${value}) in the engine output`);
    }
  }

  // 3. The engine never combines different currencies into one total.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000 }));
    input.financialObligations = [
      financialObligation({ description: "Monthly installment", amount: 1000, currency: "SAR", frequency: "monthly" }),
      financialObligation({ description: "Monthly service charge", amount: 100, currency: "USD", frequency: "monthly" }),
    ];
    const result = calculateFinancialMetrics(input);
    assert.equal(result.recurringCommitment.monthlyEquivalent.status, "unavailable", "mixed-currency recurring obligations must not be summed");
    const currencies = result.exposure.totalsByCurrency.map((entry) => entry.currency);
    assert.deepEqual([...currencies].sort(), ["SAR", "USD"]);
  }

  // 4. The engine does not count duplicates twice.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500 }));
    input.financialObligations = [
      financialObligation({ description: "Monthly installment", amount: 1500, currency: "SAR", frequency: "monthly" }),
    ];
    const result = calculateFinancialMetrics(input);
    assert.equal(result.recurringCommitment.monthlyEquivalent.value, 1500, "not 3000 — the duplicate must not be summed");
    assert.equal(result.paymentObligations.filter((o) => o.frequency === "monthly").length, 1);
  }

  // 5. Conditional penalties are excluded from guaranteed cost.
  {
    const withoutPenalty = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500, loanTermMonths: 12 }));
    withoutPenalty.fees = [fee({ description: "Documentation fee", amount: 100, currency: "SAR", isRecurring: false })];
    const baseline = calculateFinancialMetrics(withoutPenalty);

    const withPenalty = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500, loanTermMonths: 12 }));
    withPenalty.fees = [fee({ description: "Documentation fee", amount: 100, currency: "SAR", isRecurring: false })];
    withPenalty.penalties = [penalty({ description: "Late payment penalty", amount: 5000, currency: "SAR", condition: "if payment is late" })];
    const result = calculateFinancialMetrics(withPenalty);

    assert.equal(result.penalties.items[0].conditional, true);
    assert.equal(
      result.totalCost.calculatedCoreObligations.value,
      baseline.totalCost.calculatedCoreObligations.value,
      "adding a 5,000 conditional penalty must not change guaranteed core obligations at all",
    );
    // The penalty is still visible, just not folded into guaranteed cost.
    assert.equal(result.penalties.totalKnownPenalties.value, 5000);
  }

  // 6. Refundable deposits are excluded from non-refundable cost.
  {
    const withoutDeposit = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500, loanTermMonths: 12 }));
    withoutDeposit.fees = [fee({ description: "Documentation fee", amount: 100, currency: "SAR", isRecurring: false })];
    const baseline = calculateFinancialMetrics(withoutDeposit);

    const withDeposit = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500, loanTermMonths: 12 }));
    // "Mandatory" is stated explicitly so this deposit *would* qualify as
    // guaranteed cost if its `refundable: true` flag were not respected.
    withDeposit.fees = [
      fee({ description: "Documentation fee", amount: 100, currency: "SAR", isRecurring: false }),
      fee({ description: "Mandatory refundable deposit", amount: 10000, currency: "SAR", isRecurring: false }),
    ];
    const result = calculateFinancialMetrics(withDeposit);

    const depositItem = result.fees.items.find((item) => item.label.toLowerCase().includes("deposit"));
    assert.ok(depositItem);
    assert.equal(depositItem?.refundable, true);
    assert.equal(depositItem?.mandatory, true);
    assert.equal(
      result.totalCost.calculatedCoreObligations.value,
      baseline.totalCost.calculatedCoreObligations.value,
      "a mandatory-but-refundable deposit must still be excluded from guaranteed non-refundable cost",
    );
    // The deposit is still visible in upfront cash requirements (alongside the documentation fee).
    assert.equal(result.exposure.upfrontExposure.value, 10100);
  }

  // 7. Credit limits are excluded from recurring commitments.
  {
    const input = baseContractUnderstanding(creditCardDetails({ creditLimit: 50000, annualFee: 300 }));
    const result = calculateFinancialMetrics(input);
    assert.notEqual(result.recurringCommitment.monthlyEquivalent.value, 50000);
    assert.notEqual(result.recurringCommitment.annualEquivalent.value, 50000);
  }

  // 8. Insurance deductibles are excluded from insurance premiums.
  {
    const input = baseContractUnderstanding(insuranceDetails({ premiumAmount: 500, premiumFrequency: "monthly", deductible: 2000 }));
    input.fees = [fee({ description: "Policy fee", amount: 10, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    assert.equal(result.recurringCommitment.monthlyEquivalent.value, 500);
    assert.notEqual(result.recurringCommitment.monthlyEquivalent.value, 2000);
    assert.equal(result.exposure.contingentExposure.value, 2000);
  }

  // 9. Ratios are unavailable when required inputs are missing.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({}));
    const result = calculateFinancialMetrics(input);
    assert.equal(result.ratios.feesToBaseCost.status, "unavailable");
    assert.equal(result.ratios.recurringPaymentToIncome.status, "unavailable");
  }

  // 10. The same input always produces the same output (determinism).
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, downPayment: 10000, monthlyInstallment: 1500, loanTermMonths: 36 }));
    input.fees = [fee({ description: "Admin fee", amount: 100, currency: "SAR", isRecurring: false })];
    const first = calculateFinancialMetrics(structuredClone(input));
    const second = calculateFinancialMetrics(structuredClone(input));
    assert.deepEqual(first, second);
  }

  // 11. Output always validates against the Milestone 5.5 schema.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000 }));
    const result = calculateFinancialMetrics(input);
    const validation = financialMetricsSchema.safeParse(result);
    assert.equal(validation.success, true);
  }

  // 12. No Risk Score field or calculation is introduced anywhere in the output.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500 }));
    const result = calculateFinancialMetrics(input);
    const serialized = JSON.stringify(result).toLowerCase();
    assert.equal(serialized.includes("risk"), false, "no risk-related field/value may appear anywhere in the output");
    assert.equal(serialized.includes("afford"), false);
    assert.equal(serialized.includes("safe"), false);
  }

  console.log("PASS engine.invariants.test.ts");
}

run();
