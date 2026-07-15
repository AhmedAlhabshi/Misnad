import assert from "node:assert/strict";
import {
  calculateBudgetImpact,
  hasMinimumBudgetInputs,
  parseBudgetInputValue,
  type BudgetImpactInputs,
  type ContractBudgetFigures,
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

  console.log("PASS budgetImpact.test.ts");
}

run();
