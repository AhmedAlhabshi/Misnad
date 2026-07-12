import assert from "node:assert/strict";
import { extractCandidates } from "../pipeline/candidates";
import {
  autoFinanceDetails,
  baseContractUnderstanding,
  creditCardDetails,
  employmentDetails,
  extractedNumber,
  fee,
  financialObligation,
  insuranceDetails,
  penalty,
} from "./fixtures/contractUnderstanding";

export function run(): void {
  // typeDetails-derived candidates: auto_finance.
  {
    const input = baseContractUnderstanding(
      autoFinanceDetails({ financedAmount: 80000, downPayment: 10000, monthlyInstallment: 1500, balloonPayment: 20000 }),
    );
    const { candidates } = extractCandidates(input);

    const principal = candidates.find((c) => c.targetKind === "special" && c.specialKey === "principal");
    assert.ok(principal, "financedAmount must produce a principal special-value candidate");
    assert.equal(principal?.amountValue, 80000);

    const downPayment = candidates.find((c) => c.obligationType === "upfront_payment");
    assert.equal(downPayment?.amountValue, 10000);
    assert.equal(downPayment?.mandatory, true);

    const installment = candidates.find((c) => c.obligationType === "recurring_payment");
    assert.equal(installment?.amountValue, 1500);
    assert.equal(installment?.frequency, "monthly");

    const balloon = candidates.find((c) => c.obligationType === "balloon_payment");
    assert.equal(balloon?.amountValue, 20000);
  }

  // credit_card: creditLimit is a special value, never an obligation/commitment candidate.
  {
    const input = baseContractUnderstanding(creditCardDetails({ creditLimit: 15000, annualFee: 300, lateFee: 100 }));
    const { candidates } = extractCandidates(input);

    const creditLimit = candidates.find((c) => c.specialKey === "creditLimit");
    assert.equal(creditLimit?.amountValue, 15000);
    assert.equal(
      candidates.some((c) => c.targetKind === "obligation" && c.amountValue === 15000),
      false,
      "credit limit must never be extracted as an obligation candidate",
    );

    const annualFee = candidates.find((c) => c.targetKind === "fee" && c.amountValue === 300);
    assert.ok(annualFee);
    const lateFee = candidates.find((c) => c.targetKind === "penalty" && c.amountValue === 100);
    assert.ok(lateFee);
    assert.equal(lateFee?.conditional, true);
  }

  // insurance: deductible is separate from the premium.
  {
    const input = baseContractUnderstanding(
      insuranceDetails({ premiumAmount: 500, premiumFrequency: "annually", deductible: 1000 }),
    );
    const { candidates } = extractCandidates(input);
    const premium = candidates.find((c) => c.obligationType === "insurance");
    assert.equal(premium?.amountValue, 500);
    const deductible = candidates.find((c) => c.specialKey === "insuranceDeductible");
    assert.equal(deductible?.amountValue, 1000);
    assert.notEqual(premium?.amountValue, deductible?.amountValue, "the deductible must never be conflated with the premium");
  }

  // employment: baseSalary is income, never a cost/commitment candidate.
  {
    const input = baseContractUnderstanding(employmentDetails({ baseSalary: 12000, salaryFrequency: "monthly" }));
    const { candidates } = extractCandidates(input);
    const income = candidates.find((c) => c.specialKey === "monthlyIncome");
    assert.equal(income?.amountValue, 12000);
    assert.equal(candidates.some((c) => c.targetKind === "obligation"), false, "salary must not become an obligation");
  }

  // Generic financialObligations[]/fees[]/penalties[]/extractedNumbers[].
  {
    const input = baseContractUnderstanding(autoFinanceDetails());
    input.financialObligations = [
      financialObligation({ description: "Monthly maintenance fee", amount: 50, currency: "SAR", frequency: "monthly" }),
    ];
    input.fees = [fee({ description: "Administration fee", amount: 200, currency: "SAR", isRecurring: false })];
    input.penalties = [penalty({ description: "Late payment penalty", amount: 75, currency: "SAR", condition: "if payment is late" })];
    input.extractedNumbers = [
      extractedNumber({ label: "Processing charge", value: 30, unit: "SAR" }),
      extractedNumber({ label: "Loan term", value: 12, unit: "months" }),
    ];

    const { candidates } = extractCandidates(input);

    assert.ok(candidates.some((c) => c.targetKind === "obligation" && c.amountValue === 50 && c.frequency === "monthly"));
    assert.ok(candidates.some((c) => c.targetKind === "fee" && c.amountValue === 200 && c.feeType === "administration"));
    assert.ok(candidates.some((c) => c.targetKind === "penalty" && c.amountValue === 75 && c.penaltyType === "late_payment"));
    assert.ok(candidates.some((c) => c.amountValue === 30 && c.currency === "SAR"), "a currency-unit extracted number must become a candidate");
    assert.equal(
      candidates.some((c) => c.amountValue === 12),
      false,
      "a duration-unit ('months') extracted number must not become a monetary candidate",
    );
  }

  // Stated total cost detection via keyword match.
  {
    const input = baseContractUnderstanding(autoFinanceDetails());
    input.financialObligations = [
      financialObligation({ description: "Total repayment amount", amount: 95000, currency: "SAR" }),
    ];
    const { candidates } = extractCandidates(input);
    const stated = candidates.find((c) => c.specialKey === "statedTotalCost");
    assert.equal(stated?.amountValue, 95000);
  }

  console.log("PASS pipeline.candidates.test.ts");
}

run();
