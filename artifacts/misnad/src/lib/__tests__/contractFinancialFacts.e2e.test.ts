import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateFinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult } from "@/types/analysis";
import {
  buildDurationFacts,
  buildFinancialConcepts,
  groupContractFinancialConcepts,
  isStatedCapText,
  selectApplicableMonthlyOutflow,
  selectApplicableUpfrontLiquidity,
} from "../financialConcepts";

/**
 * Full end-to-end reproduction of the golden auto-finance acceptance case,
 * run through the real deterministic engine — proving requirement #9 (the
 * golden fixture produces the expected stated facts without fake
 * aggregation) and requirement #10 (a second, non-auto-finance fixture
 * proves the architecture is generic).
 */
function buildGoldenAutoFinanceAnalysis(): ContractAnalysisResult {
  return {
    contractType: "auto_finance",
    contractSummary: "A vehicle financing agreement between the buyer and the finance company.",
    contractSummarySimple: "You are financing a car and paying it back monthly.",
    parties: [],
    financialObligations: [
      { description: "Total of Payments during the financing term", amount: 115200, currency: "SAR", frequency: null, dueDate: null },
      { description: "Total repayment amount", amount: 134400, currency: "SAR", frequency: null, dueDate: null },
      { description: "Vehicle Cash Price", amount: 120000, currency: "SAR", frequency: null, dueDate: null },
    ],
    dates: [],
    penalties: [
      { description: "Actual collection costs", amount: 500, currency: "SAR", condition: "up to 500 SAR if collection action is required" },
    ],
    fees: [{ description: "Administrative fee", amount: 1200, currency: "SAR", isRecurring: false }],
    importantClauses: [],
    extractedNumbers: [],
    missingInformation: [],
    extractionNotes: null,
    typeDetails: {
      contractType: "auto_finance",
      vehicleMake: null,
      vehicleModel: null,
      vehicleYear: null,
      financedAmount: 96000,
      downPayment: 9600,
      interestRate: 8.75,
      loanTermMonths: 48,
      monthlyInstallment: 2400,
      balloonPayment: 19200,
    },
  };
}

export function run(): void {
  // --- Requirement #9: golden auto-finance fixture ---
  const analysis = buildGoldenAutoFinanceAnalysis();
  const financialMetrics = calculateFinancialMetrics(analysis as unknown as Parameters<typeof calculateFinancialMetrics>[0]);

  const concepts = buildFinancialConcepts(financialMetrics, analysis.contractType);
  const groups = groupContractFinancialConcepts(concepts);
  const durationFacts = buildDurationFacts(financialMetrics, concepts);

  // Payments the user actually makes.
  const whatYoullPay = groups.whatYoullPay ?? [];
  assert.ok(whatYoullPay.some((c) => c.conceptId === "monthly_installment" && c.amount.value === 2400));
  assert.ok(whatYoullPay.some((c) => c.conceptId === "down_payment" && c.amount.value === 9600));
  assert.ok(whatYoullPay.some((c) => c.conceptId === "final_payment" && c.amount.value === 19200));

  // Fees and costs — the admin fee must appear exactly once, never duplicated.
  const feesAndCosts = groups.feesAndCosts ?? [];
  const adminFeeOccurrences = feesAndCosts.filter((c) => c.conceptId === "administrative_fee");
  assert.equal(adminFeeOccurrences.length, 1, "the administrative fee must appear exactly once — no duplicate 1,200 SAR row");
  assert.equal(adminFeeOccurrences[0]?.amount.value, 1200);

  // Financing/credit information — the principal must be present but never among the payments the user makes.
  const financingAndCredit = groups.financingAndCredit ?? [];
  const principal = financingAndCredit.find((c) => c.conceptId === "financing_principal");
  assert.ok(principal, "the 96,000 SAR financing principal must appear as a stated fact");
  assert.equal(principal?.amount.value, 96000);
  assert.ok(!whatYoullPay.some((c) => c.amount.value === 96000), "the principal must never appear as an additional payment obligation");

  // Rates and percentages — the stated APR.
  const ratesAndPercentages = groups.ratesAndPercentages ?? [];
  const apr = ratesAndPercentages.find((c) => c.conceptId === "interest_rate");
  assert.ok(apr, "the 8.75% APR must appear as its own stated fact");
  assert.equal(apr?.percentage?.value, 8.75);

  // Conditional/potential amounts — the collection cost must stay conditional and preserve its cap wording.
  const conditionalAmounts = groups.conditionalAmounts ?? [];
  const collectionCost = conditionalAmounts.find((c) => c.amount.value === 500);
  assert.ok(collectionCost, "the collection cost must appear under conditional amounts, not as a guaranteed payment");
  assert.equal(isStatedCapText(collectionCost!), true, "the collection cost's 'up to 500 SAR' wording must be recognized as a stated cap");
  assert.ok(!whatYoullPay.some((c) => c.amount.value === 500), "a conditional collection cost must never appear as a guaranteed payment");

  // Two distinct stated totals (115,200 and 134,400) must both be preserved as separate facts, never merged, and never summed into a single aggregate.
  const otherStatedAmounts = groups.otherStatedAmounts ?? [];
  assert.ok(otherStatedAmounts.some((c) => c.amount.value === 115200), "the stated 'Total of Payments' (115,200) must be preserved");
  assert.ok(otherStatedAmounts.some((c) => c.amount.value === 134400), "the stated 'Total repayment amount' (134,400) must be preserved as a separate fact");
  assert.ok(!otherStatedAmounts.some((c) => c.amount.value === 249600), "the two distinct stated totals must never be summed together (115,200 + 134,400 would be meaningless)");

  // The 120,000 SAR vehicle cash price is a generic informational/reference
  // fact (no vehicle-specific frontend logic — it resolves purely from the
  // engine's generic `asset_value` semantic role) and must never appear as
  // a payment obligation.
  const cashPrice = concepts.find((c) => c.amount.value === 120000);
  assert.ok(cashPrice, "the 120,000 SAR vehicle cash price must become visible as an informational/reference fact");
  assert.equal(cashPrice?.conceptId, "asset_value");
  assert.equal(cashPrice?.bucket, "informational");
  assert.ok(!whatYoullPay.some((c) => c.amount.value === 120000), "the cash price must never appear as a payment the user makes");

  // No fake aggregate anywhere: the specific numbers from the original bug report must never appear as a computed total.
  const allAmounts = concepts.map((c) => c.amount.value).filter((v): v is number => v !== null);
  assert.ok(!allAmounts.includes(282500), "no fake 282,500 SAR aggregate must ever be produced");
  assert.ok(!allAmounts.includes(28800), "no calculated 28,800 SAR annual commitment must appear in Your Money unless the contract itself states it");

  // Installment count (48) is preserved as a duration/count fact, never invented.
  assert.ok(durationFacts.some((f) => f.kind === "installmentCount" && f.value === 48), "the stated 48-installment count must be preserved");
  assert.ok(durationFacts.some((f) => f.kind === "contractDuration" && f.value === 48), "the contract's own 48-month duration must be preserved");

  console.log("PASS golden auto-finance fixture produces the expected stated facts with no fake aggregation (requirement #9)");

  // --- Requirement #10: a second, non-auto-finance fixture proves the architecture is generic ---
  const leaseAnalysis: ContractAnalysisResult = {
    contractType: "lease",
    contractSummary: "A residential lease agreement.",
    contractSummarySimple: "You are renting a home.",
    parties: [],
    financialObligations: [],
    dates: [],
    penalties: [{ description: "Late payment penalty", amount: 200, currency: "SAR", condition: "up to 200 SAR if rent is paid more than 5 days late" }],
    fees: [{ description: "Brokerage fee", amount: 1500, currency: "SAR", isRecurring: false }],
    importantClauses: [],
    extractedNumbers: [],
    missingInformation: [],
    extractionNotes: null,
    typeDetails: {
      contractType: "lease",
      propertyAddress: null,
      monthlyRent: 3000,
      securityDeposit: 6000,
      leaseTermMonths: 12,
      renewalTerms: null,
      utilitiesIncluded: null,
    },
  };
  const leaseFinancialMetrics = calculateFinancialMetrics(leaseAnalysis as unknown as Parameters<typeof calculateFinancialMetrics>[0]);
  const leaseConcepts = buildFinancialConcepts(leaseFinancialMetrics, leaseAnalysis.contractType);
  const leaseGroups = groupContractFinancialConcepts(leaseConcepts);
  const leaseDurationFacts = buildDurationFacts(leaseFinancialMetrics, leaseConcepts);

  assert.ok((leaseGroups.whatYoullPay ?? []).some((c) => c.conceptId === "monthly_rent" && c.amount.value === 3000));
  assert.ok((leaseGroups.feesAndCosts ?? []).some((c) => c.conceptId === "brokerage_fee" && c.amount.value === 1500));
  assert.ok((leaseGroups.conditionalAmounts ?? []).some((c) => c.amount.value === 200));
  assert.equal(leaseGroups.financingAndCredit, undefined, "a lease with no principal/credit/coverage concept must not render that group at all");
  assert.equal(leaseGroups.ratesAndPercentages, undefined, "a lease with no stated rate must not render that group at all");
  assert.ok(leaseDurationFacts.some((f) => f.kind === "installmentCount" && f.value === 12), "the lease's own 12-month term must populate the rent's installment count generically, via the same wiring used for auto-finance");

  console.log("PASS a second, non-auto-finance (lease) fixture proves the architecture is generic (requirement #10)");

  // --- Requirement #11: RTL for Arabic, LTR for English, set explicitly at the tab root ---
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(currentDir, "..", "..", "components", "results", "ContractFinancesTab.tsx"), "utf8");
  assert.ok(/dir=\{language === "ar" \? "rtl" : "ltr"\}/.test(source), "ContractFinancesTab must set dir explicitly at its own root based on the analysis language");

  console.log("PASS ContractFinancesTab sets RTL for Arabic and LTR for English explicitly at its own root (requirement #11)");

  // --- Follow-up fix: duration and installment-count facts must use their
  // own dedicated labels, never a label borrowed from an unrelated monetary
  // concept (e.g. "Monthly installment") or the group title. ---
  assert.ok(
    source.includes("copy.finances.durationLabel") && source.includes("copy.finances.installmentCountLabel"),
    "ContractFinancesTab must label duration/count facts with their own dedicated copy, not an unrelated concept label",
  );
  assert.ok(
    !/getCanonicalConceptLabel\(fact\.conceptId/.test(source),
    "duration/installment-count facts must never borrow their label from the monetary concept they happen to describe",
  );
  console.log("PASS duration and installment-count facts use their own dedicated semantic labels, never an unrelated monetary concept's label");

  // --- Follow-up fix: a conditional/capped fact worded without an explicit
  // "if"/"penalty" trigger (via fees[], not penalties[]) must still resolve
  // conditional end-to-end through the full concept pipeline. ---
  {
    const capFixtureAnalysis = buildGoldenAutoFinanceAnalysis();
    capFixtureAnalysis.fees = [
      ...capFixtureAnalysis.fees,
      { description: "Additional collection charges, capped at SAR 300, when applicable", amount: 300, currency: "SAR", isRecurring: false },
    ];
    const capFinancialMetrics = calculateFinancialMetrics(capFixtureAnalysis as unknown as Parameters<typeof calculateFinancialMetrics>[0]);
    const capConcepts = buildFinancialConcepts(capFinancialMetrics, capFixtureAnalysis.contractType);
    const capGroups = groupContractFinancialConcepts(capConcepts);
    const cappedFee = capConcepts.find((c) => c.amount.value === 300);
    assert.ok(cappedFee, "a fee worded 'capped at ... when applicable' must still appear as a stated fact");
    assert.equal(cappedFee?.bucket, "conditional", "it must be classified conditional even without an explicit if/penalty keyword");
    assert.ok((capGroups.conditionalAmounts ?? []).some((c) => c.amount.value === 300));
    assert.ok(!(capGroups.whatYoullPay ?? []).some((c) => c.amount.value === 300), "it must never appear as a guaranteed payment");
  }
  console.log("PASS a capped/'when applicable' fee (no if/penalty keyword) resolves conditional end-to-end through the full concept pipeline");

  // --- Non-auto-finance regression for the upfront-liquidity timing fix: a lease's mandatory
  //     brokerage fee explicitly due at signing must count as upfront liquidity (alongside the
  //     security deposit), while a future renewal fee (due later, not at signing) must not — proving
  //     the fix is driven by generic role/timing semantics, not an auto-finance-specific field. ---
  {
    const leaseWithSigningFee: ContractAnalysisResult = {
      contractType: "lease",
      contractSummary: "A residential lease agreement.",
      contractSummarySimple: "You are renting a home.",
      parties: [],
      financialObligations: [],
      dates: [],
      penalties: [],
      fees: [
        { description: "Brokerage fee: 1,500 SAR, payable upon signing the lease agreement.", amount: 1500, currency: "SAR", isRecurring: false },
        { description: "Renewal administrative fee: 500 SAR, due upon renewal at the end of the lease term.", amount: 500, currency: "SAR", isRecurring: false },
      ],
      importantClauses: [],
      extractedNumbers: [],
      missingInformation: [],
      extractionNotes: null,
      typeDetails: {
        contractType: "lease",
        propertyAddress: null,
        monthlyRent: 3000,
        securityDeposit: 6000,
        leaseTermMonths: 12,
        renewalTerms: null,
        utilitiesIncluded: null,
      },
    };
    const financialMetricsForLease = calculateFinancialMetrics(leaseWithSigningFee as unknown as Parameters<typeof calculateFinancialMetrics>[0]);
    const leaseConceptsForTiming = buildFinancialConcepts(financialMetricsForLease, leaseWithSigningFee.contractType);

    const monthly = selectApplicableMonthlyOutflow(leaseConceptsForTiming);
    assert.equal(monthly?.value, 3000, "only the monthly rent must count toward the applicable monthly commitment");

    const upfront = selectApplicableUpfrontLiquidity(leaseConceptsForTiming);
    assert.equal(
      upfront?.value,
      7500,
      "upfront liquidity must include the security deposit (6,000) and the brokerage fee confirmed due at signing (1,500) = 7,500, but exclude the renewal fee (500), which is due later, not at signing",
    );
  }
  console.log("PASS a lease's mandatory brokerage fee due at signing counts as upfront liquidity, while a future renewal fee does not (non-auto-finance regression)");

  console.log("PASS contractFinancialFacts.e2e.test.ts");
}

run();
