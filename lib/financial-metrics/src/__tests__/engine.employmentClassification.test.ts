import assert from "node:assert/strict";
import { calculateFinancialMetrics } from "../engine";
import { financialMetricsSchema } from "../financialMetrics";
import { baseContractUnderstanding, employmentDetails, fee, financialObligation, penalty } from "./fixtures/contractUnderstanding";

/**
 * Regression fixture for the employment-contract financial-classification
 * feature: a confirmed employment scenario with a base salary, two fixed
 * allowances, a stated total fixed monthly compensation, a conditional
 * performance bonus, a non-cash benefit, and two textually-distinct 24,000
 * SAR conditional amounts flowing in opposite directions (an employee
 * deduction vs. an employee entitlement).
 */
export function run(): void {
  const input = baseContractUnderstanding(employmentDetails({ baseSalary: 9000, salaryFrequency: "monthly" }));
  input.financialObligations = [
    financialObligation({ description: "Housing allowance", amount: 2250, currency: "SAR", frequency: "monthly" }),
    financialObligation({ description: "Transportation allowance", amount: 750, currency: "SAR", frequency: "monthly" }),
    financialObligation({ description: "Total fixed monthly compensation", amount: 12000, currency: "SAR" }),
  ];
  input.fees = [
    fee({
      description: "Performance bonus, up to 10% of annual base salary, at the employer's sole discretion",
      amount: 900,
      currency: "SAR",
      isRecurring: false,
    }),
    fee({
      description: "Medical insurance premium covering the employee and dependents",
      amount: 150,
      currency: "SAR",
      isRecurring: true,
    }),
  ];
  input.penalties = [
    penalty({
      description: "Notice period deduction",
      amount: 24000,
      currency: "SAR",
      condition: "If the employee fails to complete the 60-day notice period, the employee shall pay the employer up to 24,000 SAR",
    }),
    penalty({
      description: "Termination compensation",
      amount: 24000,
      currency: "SAR",
      condition:
        "If the employer terminates the employment without a legitimate reason, the employee shall be entitled to compensation of up to 24,000 SAR",
    }),
  ];

  const result = calculateFinancialMetrics(input);
  assert.equal(financialMetricsSchema.safeParse(result).success, true);

  // 1. Canonical guaranteed monthly income = 12,000 (the stated total),
  //    never 12,000 + 9,000 + 2,250 + 750 double-counted.
  const monthlyIncome = result.informationalAmounts.find((a) => a.type === "monthly_income");
  assert.ok(monthlyIncome, "the canonical guaranteed monthly income must be present");
  assert.equal(monthlyIncome!.amount.value, 12000);
  console.log("PASS employment: canonical guaranteed monthly income = 12,000 (stated total preferred, consistent with components)");

  // 2. Base salary, housing allowance, and transportation allowance are all
  //    individually visible as salary components, never as PaymentObligations.
  const salaryComponents = result.informationalAmounts.filter((a) => a.type === "salary_component");
  assert.equal(salaryComponents.length, 3, "base salary + housing + transportation = 3 components");
  const componentValues = salaryComponents.map((c) => c.amount.value).sort((a, b) => (a ?? 0) - (b ?? 0));
  assert.deepEqual(componentValues, [750, 2250, 9000]);
  assert.equal(result.paymentObligations.length, 0, "salary and its components must never become payment obligations");
  console.log("PASS employment: base salary (9,000), housing (2,250), and transportation (750) are all visible, never payment obligations");

  // 3. Salary never becomes a recurring/one-time outflow or an upfront cost.
  assert.equal(result.recurringCommitment.monthlyEquivalent.status, "unavailable", "salary must never be treated as a recurring cost");
  assert.equal(result.totalCost.calculatedCoreObligations.status, "unavailable", "no guaranteed cost exists in this employment fixture");
  console.log("PASS employment: salary is never treated as a recurring or guaranteed cost");

  // 4. The performance bonus is excluded from guaranteed income and never
  //    counted as a cost either.
  const bonusFee = result.fees.items.find((f) => f.label.toLowerCase().includes("performance bonus"));
  assert.ok(bonusFee);
  assert.equal(bonusFee!.financialRole, "conditional_income", "a performance bonus flows to the user but is never guaranteed");
  assert.equal(result.fees.mandatoryFees.status, "unavailable", "the bonus and the benefit must never be counted as a mandatory fee");
  console.log("PASS employment: performance bonus is excluded from guaranteed income (financialRole conditional_income)");

  // 5. Medical insurance is a non-cash benefit, never a cost.
  const insuranceFee = result.fees.items.find((f) => f.label.toLowerCase().includes("medical insurance"));
  assert.ok(insuranceFee);
  assert.equal(insuranceFee!.financialRole, "benefit");
  console.log("PASS employment: medical insurance premium is classified as a benefit, never a recurring cost");

  // 6. The two 24,000 SAR conditional amounts remain distinct and flow in
  //    opposite directions — never deduplicated merely because the amounts match.
  const twentyFourKPenalties = result.penalties.items.filter((p) => p.amount.value === 24000);
  assert.equal(twentyFourKPenalties.length, 2, "the notice-period deduction and the termination compensation must both be present");
  const noticeDeduction = twentyFourKPenalties.find((p) => p.label.toLowerCase().includes("notice"));
  const terminationCompensation = twentyFourKPenalties.find((p) => p.label.toLowerCase().includes("termination"));
  assert.ok(noticeDeduction);
  assert.ok(terminationCompensation);
  assert.equal(noticeDeduction!.financialRole, "conditional_cost", "the notice-period deduction is owed BY the employee");
  assert.equal(terminationCompensation!.financialRole, "conditional_income", "termination compensation is owed TO the employee");
  console.log("PASS employment: the two 24,000 SAR conditional amounts stay distinct — one a cost, one an entitlement — never merged");

  console.log("PASS engine.employmentClassification.test.ts");
}

run();
