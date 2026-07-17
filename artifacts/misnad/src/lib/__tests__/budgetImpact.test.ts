import assert from "node:assert/strict";
import {
  calculateBudgetImpact,
  calculateEmploymentBudgetImpact,
  hasMinimumBudgetInputs,
  parseBudgetInputValue,
  type BudgetImpactInputs,
  type ContractBudgetFigures,
  type EmploymentBudgetImpactInputs,
  type EmploymentContractFigures,
} from "../budgetImpact";

export function run(): void {
  // The lease example from the spec: 5,000 SAR income, 1,500 essential, 500 debt, 3,000 SAR monthly commitment.
  {
    const inputs: BudgetImpactInputs = { monthlyIncome: 8000, essentialExpenses: 4000, existingMonthlyDebt: 1000, savings: null };
    const contract: ContractBudgetFigures = { monthlyCommitment: 3000, upfrontCosts: null };
    const result = calculateBudgetImpact(inputs, contract);
    assert.equal(result.availableBeforeContract, 3000, "8000 - 4000 - 1000 = 3000");
    assert.equal(result.availableAfterContract, 0, "3000 - 3000 = 0");
    assert.equal(result.contractIncomeRatio, 37.5, "3000 / 8000 * 100 = 37.5");
    assert.equal(result.totalCommitmentRatio, 50, "(1000 + 3000) / 8000 * 100 = 50");
    assert.equal(result.remainingSavings, null, "no upfront costs and no savings entered");
    assert.equal(result.emergencyCoverageMonths, null, "remainingSavings is unknown");
  }
  console.log("PASS calculateBudgetImpact computes availableBefore/After and both ratios correctly");

  // Savings and upfront costs both known -> remainingSavings and emergencyCoverageMonths become available.
  {
    const inputs: BudgetImpactInputs = { monthlyIncome: 10000, essentialExpenses: 3000, existingMonthlyDebt: 500, savings: 15000 };
    const contract: ContractBudgetFigures = { monthlyCommitment: 2000, upfrontCosts: 4050 };
    const result = calculateBudgetImpact(inputs, contract);
    assert.equal(result.remainingSavings, 10950, "15000 - 4050 = 10950");
    // totalMonthlyOutflow = 3000 + 500 + 2000 = 5500; 10950 / 5500 = 1.9909...
    assert.ok(Math.abs(result.emergencyCoverageMonths! - 10950 / 5500) < 1e-9);
  }
  console.log("PASS calculateBudgetImpact computes remainingSavings and emergencyCoverageMonths when inputs allow it");

  // monthlyCommitment unavailable -> every dependent output is null, never 0/NaN.
  {
    const inputs: BudgetImpactInputs = { monthlyIncome: 6000, essentialExpenses: 2000, existingMonthlyDebt: 500, savings: 5000 };
    const contract: ContractBudgetFigures = { monthlyCommitment: null, upfrontCosts: 1000 };
    const result = calculateBudgetImpact(inputs, contract);
    assert.equal(result.availableBeforeContract, 3500, "availableBeforeContract never depends on the contract");
    assert.equal(result.availableAfterContract, null);
    assert.equal(result.contractIncomeRatio, null);
    assert.equal(result.totalCommitmentRatio, null);
    assert.equal(result.remainingSavings, 4000, "remainingSavings only needs savings + upfrontCosts, not monthlyCommitment");
    assert.equal(result.emergencyCoverageMonths, null, "emergencyCoverageMonths needs monthlyCommitment too");
  }
  console.log("PASS calculateBudgetImpact never fabricates a value when monthlyCommitment is unavailable");

  // Zero income -> ratios must be null (division guard), never Infinity/NaN.
  {
    const inputs: BudgetImpactInputs = { monthlyIncome: 0, essentialExpenses: 0, existingMonthlyDebt: 0, savings: null };
    const contract: ContractBudgetFigures = { monthlyCommitment: 500, upfrontCosts: null };
    const result = calculateBudgetImpact(inputs, contract);
    assert.equal(result.contractIncomeRatio, null);
    assert.equal(result.totalCommitmentRatio, null);
  }
  console.log("PASS calculateBudgetImpact guards against a zero-income denominator");

  // Denominator exactly zero for emergency coverage -> null, never Infinity.
  {
    const inputs: BudgetImpactInputs = { monthlyIncome: 5000, essentialExpenses: 0, existingMonthlyDebt: 0, savings: 2000 };
    const contract: ContractBudgetFigures = { monthlyCommitment: 0, upfrontCosts: 0 };
    const result = calculateBudgetImpact(inputs, contract);
    assert.equal(result.remainingSavings, 2000);
    assert.equal(result.emergencyCoverageMonths, null, "a zero total monthly outflow must not produce Infinity");
  }
  console.log("PASS calculateBudgetImpact guards the emergency-coverage denominator against zero");

  // Negative availableAfterContract is a real, honest result (never clamped/hidden) — the contract genuinely exceeds capacity.
  {
    const inputs: BudgetImpactInputs = { monthlyIncome: 4000, essentialExpenses: 3500, existingMonthlyDebt: 500, savings: null };
    const contract: ContractBudgetFigures = { monthlyCommitment: 1000, upfrontCosts: null };
    const result = calculateBudgetImpact(inputs, contract);
    assert.equal(result.availableBeforeContract, 0);
    assert.equal(result.availableAfterContract, -1000, "a real shortfall must be shown, never hidden or clamped to 0");
  }
  console.log("PASS calculateBudgetImpact reports a real negative remaining amount honestly");

  // --- hasMinimumBudgetInputs ---
  assert.equal(hasMinimumBudgetInputs({ monthlyIncome: 5000, essentialExpenses: 1000, existingMonthlyDebt: 0 }), true);
  assert.equal(hasMinimumBudgetInputs({ monthlyIncome: 5000, essentialExpenses: 1000 }), false, "existingMonthlyDebt missing");
  assert.equal(hasMinimumBudgetInputs({}), false);
  console.log("PASS hasMinimumBudgetInputs requires income + essential expenses + existing debt (savings stays optional)");

  // --- parseBudgetInputValue ---
  assert.equal(parseBudgetInputValue("3000"), 3000);
  assert.equal(parseBudgetInputValue("  1500.5 "), 1500.5);
  assert.equal(parseBudgetInputValue(""), null, "empty input is 'not entered', not zero");
  assert.equal(parseBudgetInputValue("abc"), null);
  assert.equal(parseBudgetInputValue("-500"), null, "a negative amount is never a valid financial input here");
  assert.equal(parseBudgetInputValue("0"), 0, "zero is a valid, real value — distinct from 'not entered'");
  console.log("PASS parseBudgetInputValue parses safely, rejecting empty/invalid/negative input");

  // --- calculateEmploymentBudgetImpact: replace_current_income mode -------
  // Exact spec example: income 10,000, expenses 4,000, debts 1,000, savings
  // 30,000; contract salary 12,000.
  {
    const inputs: EmploymentBudgetImpactInputs = {
      currentMonthlyIncome: 10000,
      monthlyLivingExpenses: 4000,
      monthlyDebtPayments: 1000,
      savings: 30000,
    };
    const contract: EmploymentContractFigures = {
      guaranteedMonthlyIncome: 12000,
      confirmedRecurringEmployeeDeductions: 0,
      upfrontEmployeePayment: null,
    };
    const result = calculateEmploymentBudgetImpact(inputs, contract, "replace_current_income");
    assert.equal(result.incomeBefore, 10000);
    assert.equal(result.incomeAfter, 12000, "the new guaranteed salary replaces current income, never adds to it");
    assert.equal(result.incomeChange, 2000, "12000 - 10000 = 2000");
    assert.equal(result.remainingBefore, 5000, "10000 - 4000 - 1000 = 5000");
    assert.equal(result.remainingAfter, 7000, "12000 - 4000 - 1000 = 7000 — the salary is never treated as an expense");
    assert.equal(result.savingsAfterContract, 30000, "an employment salary must never reduce savings");
    assert.equal(result.incomeChangePercentage, 20, "2000 / 10000 * 100 = 20%");
  }
  console.log("PASS calculateEmploymentBudgetImpact: replace_current_income matches the exact spec example");

  // --- calculateEmploymentBudgetImpact: add_to_current_income mode --------
  // Same inputs, additional-income mode.
  {
    const inputs: EmploymentBudgetImpactInputs = {
      currentMonthlyIncome: 10000,
      monthlyLivingExpenses: 4000,
      monthlyDebtPayments: 1000,
      savings: 30000,
    };
    const contract: EmploymentContractFigures = {
      guaranteedMonthlyIncome: 12000,
      confirmedRecurringEmployeeDeductions: 0,
      upfrontEmployeePayment: null,
    };
    const result = calculateEmploymentBudgetImpact(inputs, contract, "add_to_current_income");
    assert.equal(result.incomeBefore, 10000);
    assert.equal(result.incomeAfter, 22000, "10000 + 12000 = 22000 — the two incomes are combined, never replaced");
    assert.equal(result.incomeChange, 12000, "the full guaranteed salary is the income change in additional-income mode");
    assert.equal(result.remainingBefore, 5000);
    assert.equal(result.remainingAfter, 17000, "22000 - 4000 - 1000 = 17000");
    assert.equal(result.savingsAfterContract, 30000, "an employment salary must never reduce savings, in either mode");
    assert.equal(result.incomeChangePercentage, 120, "12000 / 10000 * 100 = 120%");
  }
  console.log("PASS calculateEmploymentBudgetImpact: add_to_current_income matches the exact spec example");

  // --- current income = 0: never NaN/Infinity, percentage is null (UI shows "Unavailable") ---
  {
    const inputs: EmploymentBudgetImpactInputs = {
      currentMonthlyIncome: 0,
      monthlyLivingExpenses: 1000,
      monthlyDebtPayments: 0,
      savings: 5000,
    };
    const contract: EmploymentContractFigures = {
      guaranteedMonthlyIncome: 8000,
      confirmedRecurringEmployeeDeductions: 0,
      upfrontEmployeePayment: null,
    };
    const replaceResult = calculateEmploymentBudgetImpact(inputs, contract, "replace_current_income");
    assert.equal(replaceResult.incomeChangePercentage, null, "division by a zero current income must never produce NaN/Infinity");
    assert.ok(Number.isFinite(replaceResult.incomeAfter!), "incomeAfter must stay a real finite number even when current income is 0");

    const addResult = calculateEmploymentBudgetImpact(inputs, contract, "add_to_current_income");
    assert.equal(addResult.incomeChangePercentage, null, "additional-income mode must also guard against division by zero");
  }
  console.log("PASS calculateEmploymentBudgetImpact: current income of 0 never produces NaN/Infinity");

  // --- upfront employee payment: only subtracted when the contract actually states one ---
  {
    const inputs: EmploymentBudgetImpactInputs = {
      currentMonthlyIncome: 10000,
      monthlyLivingExpenses: 4000,
      monthlyDebtPayments: 1000,
      savings: 30000,
    };
    const noUpfront: EmploymentContractFigures = {
      guaranteedMonthlyIncome: 12000,
      confirmedRecurringEmployeeDeductions: 0,
      upfrontEmployeePayment: null,
    };
    assert.equal(
      calculateEmploymentBudgetImpact(inputs, noUpfront, "replace_current_income").savingsAfterContract,
      30000,
      "no upfront employee payment stated -> savings must be untouched",
    );

    const withUpfront: EmploymentContractFigures = {
      guaranteedMonthlyIncome: 12000,
      confirmedRecurringEmployeeDeductions: 0,
      upfrontEmployeePayment: 2000,
    };
    assert.equal(
      calculateEmploymentBudgetImpact(inputs, withUpfront, "replace_current_income").savingsAfterContract,
      28000,
      "an explicitly stated upfront employee payment is the only thing allowed to reduce savings",
    );
  }
  console.log("PASS calculateEmploymentBudgetImpact: savings only reduced by an explicit upfront employee payment");

  // --- confirmedRecurringEmployeeDeductions affect remainingAfter and emergency coverage, never remainingBefore ---
  {
    const inputs: EmploymentBudgetImpactInputs = {
      currentMonthlyIncome: 10000,
      monthlyLivingExpenses: 4000,
      monthlyDebtPayments: 1000,
      savings: 30000,
    };
    const contract: EmploymentContractFigures = {
      guaranteedMonthlyIncome: 12000,
      confirmedRecurringEmployeeDeductions: 500,
      upfrontEmployeePayment: null,
    };
    const result = calculateEmploymentBudgetImpact(inputs, contract, "replace_current_income");
    assert.equal(result.remainingBefore, 5000, "confirmed deductions never apply before the contract exists");
    assert.equal(result.remainingAfter, 6500, "12000 - 4000 - 1000 - 500 = 6500");
    // monthlyRequiredOutflow = 4000 + 1000 + 500 = 5500; 30000 / 5500 rounded to 1 decimal.
    assert.equal(result.emergencyFundCoverageMonths, Math.round((30000 / 5500) * 10) / 10);
  }
  console.log("PASS calculateEmploymentBudgetImpact: confirmed recurring deductions affect remainingAfter and emergency coverage only");

  console.log("PASS budgetImpact.test.ts");
}

run();
