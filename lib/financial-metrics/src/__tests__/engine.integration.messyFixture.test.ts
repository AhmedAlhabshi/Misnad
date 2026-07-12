import assert from "node:assert/strict";
import { calculateFinancialMetrics } from "../engine";
import { financialMetricsSchema } from "../financialMetrics";
import { autoFinanceDetails, baseContractUnderstanding, fee, financialObligation, penalty } from "./fixtures/contractUnderstanding";

/**
 * A single, intentionally messy auto-finance fixture combining every
 * required stress scenario at once: the same monthly installment reported
 * three times (twice agreeing, once conflicting), a refundable deposit, a
 * conditional penalty, a mixed-currency fee, and no explicit contract
 * duration anywhere.
 *
 * Because a USD fee is present alongside the SAR items, the contract's
 * currency is genuinely ambiguous (two distinct currencies, not "mostly
 * SAR") — per the corrected currency rule, `typeDetails.monthlyInstallment`
 * (which carries no currency of its own) can never be backfilled here and
 * surfaces as its own separate, unavailable obligation. Duplicate/conflict
 * collapsing is demonstrated among the explicitly SAR-tagged
 * `financialObligations[]` entries instead.
 */
export function run(): void {
  const input = baseContractUnderstanding(
    autoFinanceDetails({ financedAmount: 80000, monthlyInstallment: 1500 /* no loanTermMonths: duration missing */ }),
  );

  input.financialObligations = [
    // Exact duplicate of one another (same value, currency, frequency, label) — must dedupe, not double count.
    financialObligation({ description: "Monthly installment", amount: 1500, currency: "SAR", frequency: "monthly" }),
    financialObligation({ description: "Monthly installment", amount: 1500, currency: "SAR", frequency: "monthly" }),
    // Conflicting report of the *same* monthly installment — must resolve deterministically, not average/sum.
    financialObligation({ description: "Monthly installment", amount: 1750, currency: "SAR", frequency: "monthly" }),
  ];

  input.fees = [
    fee({ description: "Refundable security deposit", amount: 3000, currency: "SAR", isRecurring: false }),
    // Mixed currency: a fee stated in a different currency than the rest of the contract.
    fee({ description: "International wire transfer fee", amount: 25, currency: "USD", isRecurring: false }),
  ];

  input.penalties = [
    penalty({ description: "Late payment penalty", amount: 200, currency: "SAR", condition: "if payment is more than 10 days late" }),
  ];

  const result = calculateFinancialMetrics(input);

  // Output always validates against the Milestone 5.5 schema.
  assert.equal(financialMetricsSchema.safeParse(result).success, true);

  const recurringObligations = result.paymentObligations.filter(
    (obligation) => obligation.type === "recurring_payment" && obligation.frequency === "monthly",
  );
  // Two entries survive: the SAR-resolved installment (deduped/conflict-resolved down from
  // three financialObligations reports) and the typeDetails-sourced one, which stays separate
  // and unavailable because the contract's currency is ambiguous (see file doc comment).
  assert.equal(recurringObligations.length, 2, "the three SAR financialObligations reports must collapse to one; the currency-less typeDetails report stays separate");

  const sarInstallment = recurringObligations.find((obligation) => obligation.amount.currency === "SAR");
  const typeDetailsInstallment = recurringObligations.find((obligation) => obligation.amount.currency === null);
  assert.ok(sarInstallment, "the SAR-tagged installment reports must resolve to a single known entry");
  assert.ok(typeDetailsInstallment, "the currency-less typeDetails installment must remain a separate entry");

  // The conflict among the three SAR reports must be resolved deterministically (not averaged/summed) and recorded.
  assert.equal(sarInstallment?.amount.value, 1500);
  assert.equal(typeDetailsInstallment?.amount.status, "unavailable", "an amount with no resolvable currency must never be assigned one");
  assert.equal(result.recurringCommitment.monthlyEquivalent.value, 1500, "only the fully-resolved SAR installment contributes; duplicates are never summed");
  assert.ok(
    result.calculationMetadata.conflicts.some((conflict) => conflict.values.includes(1500) && conflict.values.includes(1750)),
    "the 1,500 vs 1,750 conflict (among the SAR reports) must be recorded with both rejected/selected values retained",
  );

  // Missing duration: reported unavailable, never fabricated.
  assert.equal(result.contractDuration.status, "unavailable");

  // Conditional penalty must be excluded from guaranteed/core cost.
  assert.equal(result.penalties.items.length, 1);
  assert.equal(result.penalties.items[0].conditional, true);
  assert.equal(result.penalties.totalKnownPenalties.value, 200);

  // Refundable deposit must be present but excluded from non-refundable cost accounting.
  const depositFee = result.fees.items.find((item) => item.label.toLowerCase().includes("deposit"));
  assert.ok(depositFee);
  assert.equal(depositFee?.refundable, true);

  // Mixed currency: the root currency must stay null (never a majority-vote guess), and the
  // USD fee must never be merged into the SAR totals.
  assert.equal(result.currency, null, "two distinct currencies are present, so the root currency must remain unresolved regardless of how lopsided the count is");
  const currencies = result.exposure.totalsByCurrency.map((entry) => entry.currency);
  assert.ok(currencies.includes("SAR"));
  assert.ok(currencies.includes("USD"));
  const usdFee = result.fees.items.find((item) => item.amount.currency === "USD");
  assert.ok(usdFee, "the USD fee must still appear in the fee collection on its own");

  // A mixed-currency warning must be recorded.
  assert.ok(result.calculationMetadata.warnings.some((warning) => warning.code === "MIXED_CURRENCY"));

  console.log("PASS engine.integration.messyFixture.test.ts");
}

run();
