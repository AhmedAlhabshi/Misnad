import assert from "node:assert/strict";
import { calculateContractDuration } from "../calculators/duration";
import type { Candidate } from "../pipeline/candidates";
import { autoFinanceDetails, baseContractUnderstanding, contractDate, leaseDetails, otherDetails } from "./fixtures/contractUnderstanding";

function obligationCandidate(overrides: Partial<Candidate>): Candidate {
  return {
    targetKind: "obligation",
    obligationType: "recurring_payment",
    label: "Monthly installment",
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
    sourceKind: "type_details",
    sourceField: "typeDetails.monthlyInstallment",
    evidence: "Monthly installment",
    confidence: "high",
    semanticRole: "unknown",
    context: "normal_contract_path",
    ...overrides,
  };
}

export function run(): void {
  // Explicit duration (typeDetails term field).
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ loanTermMonths: 36 }));
    const result = calculateContractDuration(input, []);
    assert.equal(result.status, "known");
    assert.equal(result.months, 36);
    assert.equal(result.unit, "months");
  }

  // lease uses leaseTermMonths.
  {
    const input = baseContractUnderstanding(leaseDetails({ leaseTermMonths: 12 }));
    const result = calculateContractDuration(input, []);
    assert.equal(result.months, 12);
  }

  // Start/end dates.
  {
    const input = baseContractUnderstanding(otherDetails());
    input.dates = [
      contractDate({ label: "Contract start date", date: "2026-01-01" }),
      contractDate({ label: "Contract end date", date: "2026-12-31" }),
    ];
    const result = calculateContractDuration(input, []);
    assert.equal(result.status, "known");
    assert.equal(result.unit, "days");
    assert.equal(result.days, 364);
    assert.equal(result.startDate, "2026-01-01");
    assert.equal(result.endDate, "2026-12-31");
  }

  // Incomplete dates (only a start date) must not produce a fabricated duration.
  {
    const input = baseContractUnderstanding(otherDetails());
    input.dates = [contractDate({ label: "Contract start date", date: "2026-01-01" })];
    const result = calculateContractDuration(input, []);
    assert.equal(result.status, "unavailable");
  }

  // Installment count and frequency (monthly-only conversion).
  {
    const input = baseContractUnderstanding(otherDetails());
    const withCount = obligationCandidate({ numberOfPayments: 24, frequency: "monthly" });
    const result = calculateContractDuration(input, [withCount]);
    assert.equal(result.status, "estimated");
    assert.equal(result.months, 24);
  }

  // Explicit duration must take priority over conflicting dates.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ loanTermMonths: 36 }));
    input.dates = [
      contractDate({ label: "Contract start date", date: "2026-01-01" }),
      contractDate({ label: "Contract end date", date: "2027-01-01" }),
    ];
    const result = calculateContractDuration(input, []);
    assert.equal(result.months, 36, "explicit typeDetails duration must win over a derived date range");
    assert.equal(result.days, null);
  }

  // Missing everything -> unavailable, never fabricated.
  {
    const input = baseContractUnderstanding(otherDetails());
    const result = calculateContractDuration(input, []);
    assert.equal(result.status, "unavailable");
    assert.equal(result.value, null);
    assert.ok(result.reason);
  }

  // Leap year date range.
  {
    const input = baseContractUnderstanding(otherDetails());
    input.dates = [
      contractDate({ label: "start", date: "2024-01-01" }),
      contractDate({ label: "end", date: "2025-01-01" }),
    ];
    const result = calculateContractDuration(input, []);
    assert.equal(result.days, 366, "2024 is a leap year, so the year must span 366 days");
  }

  console.log("PASS calculators.duration.test.ts");
}

run();
