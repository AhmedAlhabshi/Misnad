import assert from "node:assert/strict";
import { calculateFinancialMetrics } from "../engine";
import { financialMetricsSchema } from "../financialMetrics";
import {
  autoFinanceDetails,
  baseContractUnderstanding,
  extractedNumber,
  fee,
  financialObligation,
} from "./fixtures/contractUnderstanding";

/**
 * Milestone 5.6B: a real SAMA (Saudi Central Bank) early-settlement guide
 * exposed semantic bugs the engine's original bare-numbers model could not
 * express — an asset value or a principal is not a payment, an
 * early-settlement scenario amount is not a normal-path cost, and a
 * mandatory ordinary fee is not the same question as a deposit's
 * refundability. This fixture mirrors that real document's numbers exactly,
 * with duplicate representations of the down payment and monthly
 * installment spread across `typeDetails`, `financialObligations`, and
 * `extractedNumbers` — real documents restate the same figure in more than
 * one place, and the engine must collapse those into one obligation each,
 * not one per source.
 */
interface SamaFixtureValues {
  assetValue: number;
  principal: number;
  monthlyInstallment: number;
  durationMonths: number;
  downPayment: number;
  adminFee: number;
  remainingBalance: number;
  threeMonthTermCost: number;
  earlySettlementTotal: number;
}

const SAMA_VALUES: SamaFixtureValues = {
  assetValue: 150000,
  principal: 120000,
  monthlyInstallment: 2300,
  durationMonths: 60,
  downPayment: 30000,
  adminFee: 1000,
  remainingBalance: 52084.08,
  threeMonthTermCost: 705.58,
  earlySettlementTotal: 52789.66,
};

function buildSamaContractUnderstanding(values: SamaFixtureValues = SAMA_VALUES) {
  const input = baseContractUnderstanding(
    autoFinanceDetails({
      financedAmount: values.principal,
      downPayment: values.downPayment,
      loanTermMonths: values.durationMonths,
      monthlyInstallment: values.monthlyInstallment,
    }),
  );

  input.financialObligations = [
    // Duplicate representation of the down payment (also in typeDetails).
    financialObligation({ description: "Down payment (دفعة مقدمة)", amount: values.downPayment, currency: "SAR", frequency: "one_time" }),
    // Duplicate representation of the monthly installment (also in typeDetails).
    financialObligation({ description: "Monthly installment (قسط شهري)", amount: values.monthlyInstallment, currency: "SAR", frequency: "monthly" }),
  ];

  input.fees = [
    fee({
      description: "Administrative fee (admin fee) of 1,000 SAR is paid after contract execution",
      amount: values.adminFee,
      currency: "SAR",
      isRecurring: false,
    }),
  ];

  input.extractedNumbers = [
    extractedNumber({ label: "Vehicle value", value: values.assetValue, unit: "SAR" }),
    extractedNumber({ label: "Opening financed balance", value: values.principal, unit: "SAR" }),
    // Another duplicate representation of the down payment.
    extractedNumber({ label: "Down payment", value: values.downPayment, unit: "SAR" }),
    // Another duplicate representation of the monthly installment.
    extractedNumber({ label: "Monthly installment", value: values.monthlyInstallment, unit: "SAR" }),
    extractedNumber({ label: "Remaining balance in early-settlement scenario", value: values.remainingBalance, unit: "SAR" }),
    extractedNumber({ label: "Three-month term-cost amount", value: values.threeMonthTermCost, unit: "SAR" }),
    extractedNumber({ label: "Early-settlement total", value: values.earlySettlementTotal, unit: "SAR" }),
  ];

  return input;
}

export function run(): void {
  const result = calculateFinancialMetrics(buildSamaContractUnderstanding());

  assert.equal(financialMetricsSchema.safeParse(result).success, true);

  // 1. Asset value is not a payment obligation.
  assert.equal(
    result.paymentObligations.some((obligation) => obligation.amount.value === SAMA_VALUES.assetValue),
    false,
    "the 150,000 vehicle value must never appear as a payment obligation",
  );

  // 2. Principal is not a payment obligation.
  assert.equal(
    result.paymentObligations.some((obligation) => obligation.type === "principal" || obligation.amount.value === SAMA_VALUES.principal),
    false,
    "the 120,000 opening financed balance / principal must never appear as a payment obligation",
  );

  // 3. Down payment appears exactly once.
  const downPayments = result.paymentObligations.filter((obligation) => obligation.amount.value === SAMA_VALUES.downPayment);
  assert.equal(downPayments.length, 1, "the down payment (reported in typeDetails, financialObligations, and extractedNumbers) must collapse to one obligation");

  // 4. Monthly installment appears exactly once.
  const monthlyInstallments = result.paymentObligations.filter(
    (obligation) => obligation.amount.value === SAMA_VALUES.monthlyInstallment && obligation.frequency === "monthly",
  );
  assert.equal(monthlyInstallments.length, 1, "the monthly installment (reported in typeDetails, financialObligations, and extractedNumbers) must collapse to one obligation");

  // 5. Early-settlement total is not a normal obligation.
  assert.equal(
    result.paymentObligations.some((obligation) => obligation.amount.value === SAMA_VALUES.earlySettlementTotal),
    false,
    "the early-settlement total must never appear as a normal-path payment obligation",
  );

  // 6. Remaining balance is not normal exposure.
  assert.equal(
    result.exposure.totalsByCurrency.every((entry) => entry.value !== SAMA_VALUES.remainingBalance),
    true,
    "the remaining balance must never appear in normal-path totalsByCurrency",
  );
  assert.equal(
    result.paymentObligations.some((obligation) => obligation.amount.value === SAMA_VALUES.remainingBalance),
    false,
  );

  // 7. Three-month early-settlement cost is not core cost.
  assert.notEqual(result.totalCost.calculatedCoreObligations.value, SAMA_VALUES.threeMonthTermCost);
  assert.equal(
    result.paymentObligations.some((obligation) => obligation.amount.value === SAMA_VALUES.threeMonthTermCost),
    false,
    "the three-month early-settlement term cost must never enter core cost",
  );

  // 8. Admin fee is mandatory.
  const adminFee = result.fees.items.find((item) => item.amount.value === SAMA_VALUES.adminFee);
  assert.ok(adminFee, "the admin fee must be present in the fee collection");
  assert.equal(adminFee?.mandatory, true, "an admin fee explicitly stated as 'is paid after contract execution' must infer mandatory=true");

  // 9. Admin fee enters core cost.
  assert.equal(result.fees.mandatoryFees.value, SAMA_VALUES.adminFee);

  // 10. Core obligations equal 169,000 SAR.
  assert.equal(result.totalCost.calculatedCoreObligations.value, 169000);
  assert.equal(result.totalCost.calculatedCoreObligations.currency, "SAR");

  // 11. Known cost equals 169,000 SAR.
  assert.equal(result.totalCost.calculatedKnownCost.value, 169000);

  // 12. Upfront exposure equals 31,000 SAR.
  assert.equal(result.exposure.upfrontExposure.value, 31000);

  // 13. Maximum single payment equals 30,000 SAR.
  assert.equal(result.exposure.maximumSinglePayment.value, 30000);

  // 14. totalsByCurrency contains SAR 169,000 only.
  assert.equal(result.exposure.totalsByCurrency.length, 1);
  assert.equal(result.exposure.totalsByCurrency[0]?.currency, "SAR");
  assert.equal(result.exposure.totalsByCurrency[0]?.value, 169000);

  // 15. totalCostIncrease equals 40.83.
  assert.equal(result.ratios.totalCostIncrease.value, 40.83);

  // 16. No duplicate English/Arabic obligations remain.
  assert.equal(result.paymentObligations.length, 2, "only the down payment and the monthly installment survive as obligations");

  // 17. Scenario values remain excluded with metadata where supported.
  const excludedReasonCodes = result.calculationMetadata.excludedValues.map((entry) => entry.reasonCode);
  assert.ok(
    excludedReasonCodes.some((code) => code.startsWith("not_a_payment_obligation:asset_value")),
    "the asset value's exclusion must be recorded, not silently dropped",
  );
  assert.ok(
    excludedReasonCodes.some((code) => code.startsWith("not_a_payment_obligation:principal")),
    "the duplicate principal's exclusion must be recorded",
  );
  assert.ok(
    excludedReasonCodes.some((code) => code.startsWith("not_a_payment_obligation:scenario_balance:early_settlement_scenario")),
    "the remaining balance's exclusion must be recorded with its scenario context",
  );
  assert.equal(
    excludedReasonCodes.filter((code) => code.startsWith("not_a_payment_obligation:scenario_payment:early_settlement_scenario")).length,
    2,
    "both the three-month term cost and the early-settlement total must be recorded as excluded scenario payments",
  );

  // 18. Existing mixed-currency behavior remains correct: a second currency
  // present alongside the SAR contract must appear as its own separate
  // totalsByCurrency entry, never merged into the SAR total.
  {
    const mixedInput = buildSamaContractUnderstanding();
    mixedInput.fees.push(fee({ description: "International courier fee is charged", amount: 40, currency: "USD", isRecurring: false }));
    const mixedResult = calculateFinancialMetrics(mixedInput);
    const currencies = mixedResult.exposure.totalsByCurrency.map((entry) => entry.currency);
    assert.ok(currencies.includes("SAR"));
    assert.ok(currencies.includes("USD"));
    const sarEntry = mixedResult.exposure.totalsByCurrency.find((entry) => entry.currency === "SAR");
    assert.equal(sarEntry?.value, 169000, "the SAR total must be unaffected by an unrelated USD fee");
  }

  // 19. Existing deposit-refundability corrections remain correct — and,
  // critically, an *ordinary* mandatory fee with unstated refundability is
  // not the same question as a *deposit* with unstated refundability: the
  // former is a real cost regardless (refundability was never in doubt for
  // an ordinary fee), the latter must remain excluded/unresolved until the
  // text says otherwise.
  {
    const input = baseContractUnderstanding(autoFinanceDetails({ financedAmount: 50000 }));
    input.fees = [
      // An ordinary fee with no refundability wording at all — must still count as a real cost.
      fee({ description: "Processing fee is charged", amount: 300, currency: "SAR", isRecurring: false }),
      // A deposit with no refundability wording at all — must remain excluded/unresolved, never assumed either way.
      fee({ description: "Security deposit is paid at signing", amount: 2000, currency: "SAR", isRecurring: false }),
    ];
    const result2 = calculateFinancialMetrics(input);
    const processingFee = result2.fees.items.find((item) => item.amount.value === 300);
    const depositFee = result2.fees.items.find((item) => item.amount.value === 2000);
    assert.ok(processingFee);
    assert.ok(depositFee);
    assert.equal(processingFee?.mandatory, true);
    assert.equal(depositFee?.mandatory, true);
    assert.equal(processingFee?.refundable, null, "the ordinary fee's refundability is genuinely unstated");
    assert.equal(depositFee?.refundable, null, "the deposit's refundability is genuinely unstated");
    assert.equal(result2.fees.mandatoryFees.value, 300, "the ordinary fee counts toward mandatory cost; the deposit with unresolved refundability does not");
    assert.ok(
      result2.calculationMetadata.excludedValues.some((entry) => entry.reasonCode === "deposit_refundability_unresolved" && entry.value === 2000),
      "the unresolved deposit must be recorded as excluded, never silently assumed refundable or non-refundable",
    );
  }

  // 20. All prior 21 Financial Metrics test files still pass — verified by running the full suite alongside this file, not by an in-process assertion here.

  console.log("PASS engine.samaRealDocument.test.ts");
}

run();
