import assert from "node:assert/strict";
import { calculateFinancialMetrics } from "../engine";
import { financialMetricsSchema } from "../financialMetrics";
import {
  autoFinanceDetails,
  baseContractUnderstanding,
  contractDate,
  creditCardDetails,
  employmentDetails,
  fee,
  financialObligation,
  insuranceDetails,
  leaseDetails,
  mortgageDetails,
  otherDetails,
  penalty,
  personalFinanceDetails,
  subscriptionDetails,
} from "./fixtures/contractUnderstanding";

export function run(): void {
  // 1. auto_finance — partial data: financed amount, installment, and term known; no balloon.
  // typeDetails fields never carry their own currency in Milestone 4's schema, so a
  // realistic fixture also includes one currency-bearing fee (as a real extraction would)
  // for the contract-wide currency to resolve unambiguously.
  {
    const input = baseContractUnderstanding(
      autoFinanceDetails({ financedAmount: 80000, downPayment: 10000, monthlyInstallment: 1800, loanTermMonths: 48 }),
    );
    input.fees = [fee({ description: "Documentation fee", amount: 100, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);
    assert.equal(result.totalCost.calculatedBaseCost.value, 80000);
    assert.equal(result.recurringCommitment.monthlyEquivalent.value, 1800);
    assert.equal(result.contractDuration.months, 48);
  }

  // 2. credit_card — no principal concept; credit limit must never leak into recurring commitment.
  {
    const input = baseContractUnderstanding(creditCardDetails({ creditLimit: 20000, annualFee: 300, lateFee: 150 }));
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);
    assert.equal(result.totalCost.calculatedBaseCost.status, "unavailable", "credit cards have no principal");
    assert.notEqual(result.recurringCommitment.monthlyEquivalent.value, 20000);
    assert.equal(result.penalties.items.length, 1);
    assert.equal(result.ratios.recurringPaymentToIncome.status, "unavailable");
  }

  // 3. mortgage — down payment, loan amount, monthly installment, term in years.
  {
    const input = baseContractUnderstanding(
      mortgageDetails({ loanAmount: 500000, downPayment: 100000, monthlyInstallment: 3000, loanTermYears: 25 }),
    );
    input.fees = [fee({ description: "Valuation fee", amount: 500, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);
    assert.equal(result.totalCost.calculatedBaseCost.value, 500000);
    assert.equal(result.contractDuration.unit, "years");
    assert.equal(result.contractDuration.value, 25);
  }

  // 4. personal_finance — loan amount and installment only, no term.
  {
    const input = baseContractUnderstanding(personalFinanceDetails({ loanAmount: 30000, monthlyInstallment: 900 }));
    input.fees = [fee({ description: "Processing fee", amount: 150, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);
    assert.equal(result.contractDuration.status, "unavailable", "no term or dates were provided");
    assert.equal(result.recurringCommitment.monthlyEquivalent.value, 900);
  }

  // 5. lease — monthly rent and a refundable security deposit.
  {
    const input = baseContractUnderstanding(leaseDetails({ monthlyRent: 4000, securityDeposit: 8000, leaseTermMonths: 12 }));
    input.fees = [fee({ description: "Lease registration fee", amount: 200, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);
    const depositObligation = result.paymentObligations.find((o) => o.type === "deposit");
    assert.ok(depositObligation);
    // Upfront cash requirement includes both the deposit and the upfront registration fee.
    assert.equal(result.exposure.upfrontExposure.value, 8200);
  }

  // 6. insurance — premium and deductible kept separate.
  {
    const input = baseContractUnderstanding(
      insuranceDetails({ premiumAmount: 1200, premiumFrequency: "annual", deductible: 500, policyTermMonths: 12 }),
    );
    input.fees = [fee({ description: "Policy issuance fee", amount: 50, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);
    assert.equal(result.recurringCommitment.monthlyEquivalent.value, 100, "annual premium of 1200 must convert to 100/month");
    assert.equal(result.exposure.contingentExposure.value, 500, "the deductible must land in contingent exposure, not the premium");
  }

  // 7. employment — base salary is income, never a cost.
  {
    const input = baseContractUnderstanding(employmentDetails({ baseSalary: 15000, salaryFrequency: "monthly" }));
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);
    assert.equal(result.paymentObligations.length, 0, "salary must not appear as a payment obligation");
    assert.equal(result.recurringCommitment.monthlyEquivalent.status, "unavailable");
  }

  // 8. subscription — recurring billing amount.
  {
    const input = baseContractUnderstanding(subscriptionDetails({ billingAmount: 49, billingFrequency: "monthly", autoRenew: true }));
    input.fees = [fee({ description: "One-time setup fee", amount: 20, currency: "SAR", isRecurring: false })];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);
    assert.equal(result.recurringCommitment.monthlyEquivalent.value, 49);
  }

  // 9. other — entirely dependent on generic arrays.
  {
    const input = baseContractUnderstanding(otherDetails({ description: "A generic agreement" }));
    input.financialObligations = [financialObligation({ description: "Monthly service charge", amount: 250, currency: "SAR", frequency: "monthly" })];
    input.fees = [fee({ description: "Administration fee", amount: 100, currency: "SAR", isRecurring: false })];
    input.penalties = [penalty({ description: "Late payment penalty", amount: 40, currency: "SAR", condition: "if paid late" })];
    input.dates = [
      contractDate({ label: "Effective start date", date: "2026-01-01" }),
      contractDate({ label: "Contract termination date", date: "2026-12-31" }),
    ];
    const result = calculateFinancialMetrics(input);
    assert.equal(financialMetricsSchema.safeParse(result).success, true);
    assert.equal(result.recurringCommitment.monthlyEquivalent.value, 250);
    assert.equal(result.contractDuration.status, "known");
    assert.equal(result.penalties.items.length, 1);
    assert.equal(result.penalties.items[0].conditional, true);
  }

  console.log("PASS engine.integration.contractTypes.test.ts");
}

run();
