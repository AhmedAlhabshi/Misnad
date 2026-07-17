import assert from "node:assert/strict";
import type {
  FeeItem,
  FinancialMetrics,
  InformationalAmount,
  MoneyMetric,
  PaymentObligation,
} from "@workspace/financial-metrics";
import type { ContractAnalysisResult } from "@/types/analysis";
import type { PersonalizedAnalysisSessionState } from "@/hooks/usePersonalizedAnalysisSession";
import { buildReportSummaryData, canIncludePersonalizedInReport } from "../reportSummary";

function knownMoney(value: number, currency = "SAR"): MoneyMetric {
  return { value, currency, status: "known", source: "test", reason: null, confidence: "high" };
}

function unavailableMoney(): MoneyMetric {
  return { value: null, currency: null, status: "unavailable", source: null, reason: "n/a", confidence: "low" };
}

function unavailablePercentage() {
  return { value: null, status: "unavailable" as const, source: null, reason: "n/a", confidence: "low" as const };
}

function obligation(overrides: Partial<PaymentObligation> = {}): PaymentObligation {
  return {
    id: "obligation-0",
    label: "Monthly installment",
    type: "recurring_payment",
    amount: knownMoney(2400),
    frequency: "monthly",
    numberOfPayments: 48,
    startDate: null,
    endDate: null,
    mandatory: true,
    conditional: false,
    refundable: null,
    financialRole: "recurring_outflow",
    sourceFields: [],
    ...overrides,
  };
}

function informationalAmount(overrides: Partial<InformationalAmount> = {}): InformationalAmount {
  return {
    id: "informational-0",
    type: "principal",
    label: "Financed amount",
    amount: knownMoney(96000),
    percentage: unavailablePercentage(),
    financialRole: "financing_principal",
    sourceFields: [],
    ...overrides,
  };
}

function feeItem(overrides: Partial<FeeItem> = {}): FeeItem {
  return {
    id: "fee-0",
    type: "administration",
    label: "Administrative fee",
    amount: knownMoney(1200),
    percentage: unavailablePercentage(),
    calculationBase: null,
    frequency: "one_time",
    mandatory: true,
    conditional: false,
    refundable: null,
    financialRole: "one_time_outflow",
    sourceFields: [],
    ...overrides,
  };
}

function buildFinancialMetrics(overrides: {
  paymentObligations?: PaymentObligation[];
  informationalAmounts?: InformationalAmount[];
  fees?: FeeItem[];
  contractDurationMonths?: number | null;
} = {}): FinancialMetrics {
  return {
    schemaVersion: "1.0",
    currency: "SAR",
    paymentObligations: overrides.paymentObligations ?? [],
    informationalAmounts: overrides.informationalAmounts ?? [],
    recurringCommitment: {
      actualMonthlyAmount: unavailableMoney(),
      monthlyEquivalent: unavailableMoney(),
      annualEquivalent: unavailableMoney(),
      minimumMonthlyAmount: unavailableMoney(),
      maximumMonthlyAmount: unavailableMoney(),
      isVariable: null,
      includedObligationIds: [],
    },
    contractDuration:
      overrides.contractDurationMonths != null
        ? {
            value: overrides.contractDurationMonths,
            unit: "months",
            months: overrides.contractDurationMonths,
            days: null,
            startDate: null,
            endDate: null,
            status: "known",
            source: "test",
            reason: null,
            confidence: "high",
          }
        : {
            value: null,
            unit: null,
            months: null,
            days: null,
            startDate: null,
            endDate: null,
            status: "unavailable",
            source: null,
            reason: "n/a",
            confidence: "low",
          },
    totalCost: {
      statedTotalCost: unavailableMoney(),
      calculatedBaseCost: unavailableMoney(),
      calculatedCoreObligations: unavailableMoney(),
      calculatedKnownCost: unavailableMoney(),
      financingRepaymentTotal: unavailableMoney(),
      financingCost: unavailableMoney(),
      estimatedContractCost: unavailableMoney(),
      differenceFromStated: { classification: "unavailable", amount: unavailableMoney(), reason: "n/a" },
    },
    fees: {
      items: overrides.fees ?? [],
      totalKnownFees: unavailableMoney(),
      mandatoryFees: unavailableMoney(),
      upfrontFees: unavailableMoney(),
      recurringFees: unavailableMoney(),
      conditionalFees: unavailableMoney(),
      hasUndefinedFees: null,
      status: "unavailable",
    },
    penalties: {
      items: [],
      totalKnownPenalties: unavailableMoney(),
      highestKnownPenalty: unavailableMoney(),
      hasUndefinedPenalty: null,
      status: "unavailable",
    },
    ratios: {
      feesToBaseCost: unavailablePercentage(),
      penaltiesToBaseCost: unavailablePercentage(),
      upfrontPaymentToBaseCost: unavailablePercentage(),
      balloonPaymentToBaseCost: unavailablePercentage(),
      totalCostIncrease: unavailablePercentage(),
      recurringPaymentToIncome: unavailablePercentage(),
    },
    exposure: {
      totalKnownExposure: unavailableMoney(),
      monthlyExposure: unavailableMoney(),
      annualExposure: unavailableMoney(),
      upfrontExposure: unavailableMoney(),
      contingentExposure: unavailableMoney(),
      maximumSinglePayment: unavailableMoney(),
      unquantifiedContingentExposure: null,
      totalsByCurrency: [],
    },
    positiveFinancialFactors: [],
    calculationMetadata: { formulasUsed: [], unavailableCalculations: [], warnings: [], conflicts: [], excludedValues: [] },
  };
}

function baseAnalysis(overrides: Partial<ContractAnalysisResult> = {}): ContractAnalysisResult {
  return {
    contractType: "auto_finance",
    contractSummary: "A test contract summary.",
    contractSummarySimple: "A simple test contract summary.",
    parties: [],
    financialObligations: [],
    dates: [],
    penalties: [],
    fees: [],
    importantClauses: [],
    extractedNumbers: [],
    missingInformation: [],
    extractionNotes: null,
    typeDetails: { contractType: "auto_finance" },
    ...overrides,
  };
}

const EMPTY_SESSION: PersonalizedAnalysisSessionState = {
  form: { monthlyIncome: "", essentialExpenses: "", existingDebt: "", savings: "" },
  budgetResult: null,
  employmentIncomeMode: null,
  employmentBudgetResult: null,
  status: "idle",
  result: null,
};

function completedSession(overrides: Partial<PersonalizedAnalysisSessionState> = {}): PersonalizedAnalysisSessionState {
  return {
    form: { monthlyIncome: "10000", essentialExpenses: "3000", existingDebt: "500", savings: "20000" },
    budgetResult: {
      availableBeforeContract: 6500,
      availableAfterContract: 4100,
      contractIncomeRatio: 24,
      totalCommitmentRatio: 29,
      remainingSavings: 15650,
      emergencyCoverageMonths: 2.5,
      monthlyContractCommitment: 2400,
      totalMonthlyOutflowBeforeContract: 3500,
      totalMonthlyOutflowAfterContract: 5900,
      remainingMonthlyBeforeContract: 6500,
      remainingMonthlyAfterContract: 4100,
      newContractBurdenRatio: 24,
      totalOutflowRatioAfterContract: 59,
      initialCashRequired: 4350,
      savingsAfterInitialCash: 15650,
      emergencyFundCoverageMonths: 2.5,
    },
    employmentIncomeMode: null,
    employmentBudgetResult: null,
    status: "success",
    result: {
      personalImpact: [{ title: "Affordable", explanation: "This contract fits comfortably within your budget.", basis: "budget" }],
      thingsToWatch: [],
      beforeYouSign: [],
    },
    ...overrides,
  };
}

function completedEmploymentSession(
  employmentBudgetResult: NonNullable<PersonalizedAnalysisSessionState["employmentBudgetResult"]>,
  overrides: Partial<PersonalizedAnalysisSessionState> = {},
): PersonalizedAnalysisSessionState {
  return {
    form: { monthlyIncome: "10000", essentialExpenses: "4000", existingDebt: "1000", savings: "30000" },
    budgetResult: null,
    employmentIncomeMode: "replace_current_income",
    employmentBudgetResult,
    status: "success",
    result: {
      personalImpact: [{ title: "Higher income", explanation: "Your new guaranteed salary is higher than your current income.", basis: "income" }],
      thingsToWatch: [],
      beforeYouSign: [],
    },
    ...overrides,
  };
}

export function run(): void {
  const now = new Date("2026-03-15T12:00:00.000Z");

  // --- contract-only summary: full happy path ----------------------------
  {
    const analysis = baseAnalysis({
      importantClauses: [
        { title: "Late payment", summary: "Late fee applies.", riskLevel: "high", evidence: null, plainExplanation: "x" },
        { title: "Insurance", summary: "Insurance required.", riskLevel: "medium", evidence: null, plainExplanation: "x" },
      ],
    });
    const financialMetrics = buildFinancialMetrics({
      paymentObligations: [obligation()],
      informationalAmounts: [informationalAmount()],
      contractDurationMonths: 48,
    });
    const data = buildReportSummaryData({
      language: "en",
      analysis,
      financialMetrics,
      includePersonalized: false,
      personalizedSession: EMPTY_SESSION,
      now,
    });
    assert.equal(data.language, "en");
    assert.equal(data.generatedAt, now.toISOString());
    assert.ok(data.contract.title.length > 0, "contract title must be non-empty");
    assert.equal(data.contract.overallRisk, "high", "worst risk across clauses must be high");
    assert.ok(data.contract.duration?.includes("48"), "duration text must include the real stated duration value");
    assert.ok(data.keyFinancialFigures.length > 0, "at least one key figure must be produced from real data");
    assert.equal(data.importantFindings.length, 2);
    assert.equal(data.importantFindings[0]!.riskLevel, "high", "high risk clause must be ranked first");
    assert.equal(data.importantFindings[1]!.riskLevel, "medium");
    assert.ok(data.conclusion.length > 0);
    assert.equal(data.personalized, undefined, "personalized must be omitted when includePersonalized is false");
  }
  console.log("PASS buildReportSummaryData: contract-only summary happy path");

  // --- personalized summary: full happy path ------------------------------
  {
    const analysis = baseAnalysis();
    const financialMetrics = buildFinancialMetrics({
      paymentObligations: [obligation()],
    });
    const session = completedSession();
    const data = buildReportSummaryData({
      language: "en",
      analysis,
      financialMetrics,
      includePersonalized: true,
      personalizedSession: session,
      now,
    });
    assert.ok(data.personalized, "personalized section must be present when includePersonalized is true and session is complete");
    assert.match(data.personalized!.monthlyIncome, /10,?000/, "monthly income must reflect the form input");
    assert.match(data.personalized!.newContractCommitment, /2,?400/, "new contract commitment must reflect the monthly obligation");
    assert.equal(data.personalized!.conclusion, "This contract fits comfortably within your budget.");
  }
  console.log("PASS buildReportSummaryData: personalized summary happy path");

  // --- canIncludePersonalizedInReport ------------------------------------
  {
    assert.equal(canIncludePersonalizedInReport(EMPTY_SESSION), false);
    assert.equal(canIncludePersonalizedInReport(completedSession()), true);
    assert.equal(canIncludePersonalizedInReport(completedSession({ status: "loading" })), false);
  }
  console.log("PASS canIncludePersonalizedInReport reflects actual session completion, never assumed true");

  // --- missing optional values: never fake zeroes -------------------------
  {
    const analysis = baseAnalysis();
    const data = buildReportSummaryData({
      language: "en",
      analysis,
      financialMetrics: null,
      includePersonalized: true,
      personalizedSession: EMPTY_SESSION,
      now,
    });
    assert.deepEqual(data.keyFinancialFigures, [], "no financial metrics means no key figures — never fabricated zeros");
    assert.equal(data.contract.duration, null);
    assert.equal(data.personalized, undefined, "personalized must be omitted when the session was never completed");
  }
  console.log("PASS buildReportSummaryData: missing financialMetrics/personalized data never produces fake values");

  // --- includePersonalized true but session incomplete -> still omitted --
  {
    const analysis = baseAnalysis();
    const data = buildReportSummaryData({
      language: "en",
      analysis,
      financialMetrics: buildFinancialMetrics(),
      includePersonalized: true,
      personalizedSession: completedSession({ status: "unavailable", result: null }),
      now,
    });
    assert.equal(data.personalized, undefined, "an incomplete/unavailable personalized session must never be included even if requested");
  }
  console.log("PASS buildReportSummaryData: incomplete personalized session is never force-included");

  // --- findings stay a one-sentence executive headline, never the clause's
  // full multi-sentence AI summary (keeps the PDF a concise summary, not a
  // clause-by-clause report) ---------------------------------------------
  {
    const analysis = baseAnalysis({
      importantClauses: [
        {
          title: "Late payment",
          summary:
            "If the customer fails to pay any installment for more than 30 days, the financing company will issue a written notice. No fixed penalty applies, but actual collection costs may be charged, capped at 500 SAR.",
          riskLevel: "high",
          evidence: null,
          plainExplanation: "x",
        },
      ],
    });
    const data = buildReportSummaryData({
      language: "en",
      analysis,
      financialMetrics: null,
      includePersonalized: false,
      personalizedSession: EMPTY_SESSION,
      now,
    });
    assert.equal(
      data.importantFindings[0]!.summary,
      "If the customer fails to pay any installment for more than 30 days, the financing company will issue a written notice.",
      "a finding must show only the clause's first sentence, never its full multi-sentence summary",
    );
  }
  console.log("PASS buildReportSummaryData: findings are trimmed to a single headline sentence, never the full clause summary");

  // --- deterministic finding ranking: high > medium > conditional > missing
  {
    const analysis = baseAnalysis({
      importantClauses: [
        { title: "Low risk clause", summary: "s", riskLevel: "low", evidence: null, plainExplanation: "x" },
        { title: "High risk clause", summary: "s", riskLevel: "high", evidence: null, plainExplanation: "x" },
        { title: "Medium risk clause", summary: "s", riskLevel: "medium", evidence: null, plainExplanation: "x" },
      ],
      missingInformation: [{ field: "typeDetails.apr", reason: "APR was not stated in the contract." }],
    });
    const data = buildReportSummaryData({
      language: "en",
      analysis,
      financialMetrics: buildFinancialMetrics(),
      includePersonalized: false,
      personalizedSession: EMPTY_SESSION,
      now,
    });
    // High and medium clauses come first, in that order; low-risk clauses are
    // never promoted ahead of missing-information (the 4th priority tier).
    assert.equal(data.importantFindings[0]!.title, "High risk clause");
    assert.equal(data.importantFindings[1]!.title, "Medium risk clause");
    assert.ok(
      data.importantFindings.some((f) => f.title === "APR was not stated in the contract."),
      "missing-information must be included once higher-priority tiers are exhausted",
    );
  }
  console.log("PASS buildReportSummaryData: findings ranked high > medium > conditional obligations > missing information");

  // --- maximum finding count: never more than 5 ---------------------------
  {
    const analysis = baseAnalysis({
      importantClauses: Array.from({ length: 8 }, (_, i) => ({
        title: `High risk clause ${i}`,
        summary: "s",
        riskLevel: "high" as const,
        evidence: null,
        plainExplanation: "x",
      })),
    });
    const data = buildReportSummaryData({
      language: "en",
      analysis,
      financialMetrics: buildFinancialMetrics(),
      includePersonalized: false,
      personalizedSession: EMPTY_SESSION,
      now,
    });
    assert.equal(data.importantFindings.length, 5, "importantFindings must never exceed 5, even with many high-risk clauses");
  }
  console.log("PASS buildReportSummaryData: importantFindings capped at 5");

  // --- no duplicate financial figures: same concept id, first wins --------
  {
    const analysis = baseAnalysis();
    const financialMetrics = buildFinancialMetrics({
      paymentObligations: [
        obligation({ id: "a", label: "Monthly installment A", amount: knownMoney(2400) }),
        obligation({ id: "b", label: "Monthly installment B", amount: knownMoney(2500) }),
      ],
    });
    const data = buildReportSummaryData({
      language: "en",
      analysis,
      financialMetrics,
      includePersonalized: false,
      personalizedSession: EMPTY_SESSION,
      now,
    });
    const installmentFigures = data.keyFinancialFigures.filter((f) => f.key === "monthly_installment");
    assert.equal(installmentFigures.length, 1, "two obligations resolving to the same concept id must produce only one figure");
  }
  console.log("PASS buildReportSummaryData: no duplicate/equivalent key financial figures for the same concept");

  // --- maximum key figures: never more than 5 -----------------------------
  {
    const analysis = baseAnalysis();
    const financialMetrics = buildFinancialMetrics({
      paymentObligations: [
        obligation({ id: "installment", label: "Monthly installment", amount: knownMoney(2400), obligationType: undefined }),
        obligation({ id: "down", label: "Down payment", type: "upfront_payment", obligationType: "upfront_payment", amount: knownMoney(9600), financialRole: "upfront_liquidity", frequency: "one_time" }),
        obligation({ id: "final", label: "Final payment", type: "balloon_payment", obligationType: "balloon_payment", amount: knownMoney(19200), financialRole: "upfront_liquidity", frequency: "one_time" }),
        obligation({ id: "deposit", label: "Security deposit", type: "deposit", obligationType: "deposit", amount: knownMoney(3000), financialRole: "refundable", frequency: "one_time" }),
      ],
      informationalAmounts: [
        informationalAmount({ id: "principal", type: "principal", label: "Financed amount", amount: knownMoney(96000) }),
        informationalAmount({
          id: "rate",
          type: "rate",
          label: "APR",
          amount: unavailableMoney(),
          percentage: { value: 8.75, status: "known", source: "test", reason: null, confidence: "high" },
          financialRole: "rate_or_percentage",
        }),
      ],
      contractDurationMonths: 48,
    });
    const data = buildReportSummaryData({
      language: "en",
      analysis,
      financialMetrics,
      includePersonalized: false,
      personalizedSession: EMPTY_SESSION,
      now,
    });
    assert.ok(data.keyFinancialFigures.length <= 5, "keyFinancialFigures must never exceed 5");
  }
  console.log("PASS buildReportSummaryData: keyFinancialFigures capped at 5");

  // --- Arabic labels -------------------------------------------------------
  {
    const analysis = baseAnalysis({
      importantClauses: [{ title: "بند مهم", summary: "ملخص البند.", riskLevel: "high", evidence: null, plainExplanation: "x" }],
    });
    const financialMetrics = buildFinancialMetrics({ paymentObligations: [obligation()] });
    const data = buildReportSummaryData({
      language: "ar",
      analysis,
      financialMetrics,
      includePersonalized: false,
      personalizedSession: EMPTY_SESSION,
      now,
    });
    assert.equal(data.language, "ar");
    assert.ok(data.keyFinancialFigures[0]!.label.length > 0);
    // Labels must actually be Arabic text (contain at least one Arabic-range character).
    assert.match(data.keyFinancialFigures[0]!.label, /[؀-ۿ]/, "figure labels must be Arabic when language is ar");
    assert.match(data.conclusion, /[؀-ۿ]/, "conclusion must be Arabic when language is ar");
  }
  console.log("PASS buildReportSummaryData: Arabic labels/copy used when language is ar");

  // --- English labels -------------------------------------------------------
  {
    const analysis = baseAnalysis();
    const financialMetrics = buildFinancialMetrics({ paymentObligations: [obligation()] });
    const data = buildReportSummaryData({
      language: "en",
      analysis,
      financialMetrics,
      includePersonalized: false,
      personalizedSession: EMPTY_SESSION,
      now,
    });
    assert.equal(data.language, "en");
    assert.doesNotMatch(data.keyFinancialFigures[0]!.label, /[؀-ۿ]/, "figure labels must not contain Arabic when language is en");
  }
  console.log("PASS buildReportSummaryData: English labels/copy used when language is en");

  // --- employment: personalized PDF section uses employmentBudgetResult,
  // never the generic obligation-oriented `personalized` shape -------------
  {
    const analysis = baseAnalysis({ contractType: "employment", typeDetails: { contractType: "employment" } });
    const session = completedEmploymentSession({
      incomeBefore: 10000,
      incomeAfter: 12000,
      remainingBefore: 5000,
      remainingAfter: 7000,
      incomeChange: 2000,
      incomeChangePercentage: 20,
      savingsAfterContract: 30000,
      emergencyFundCoverageMonths: 6,
    });
    const data = buildReportSummaryData({
      language: "en",
      analysis,
      financialMetrics: null,
      includePersonalized: true,
      personalizedSession: session,
      now,
    });
    assert.equal(data.personalized, undefined, "employment must never produce the generic obligation-oriented personalized section");
    assert.ok(data.employmentPersonalized, "employment must produce its own employmentPersonalized PDF section");
    assert.match(data.employmentPersonalized!.incomeBefore, /10,?000/);
    assert.match(data.employmentPersonalized!.incomeAfter, /12,?000/);
    assert.match(data.employmentPersonalized!.incomeChange, /2,?000/);
    assert.match(data.employmentPersonalized!.incomeChangePercentage, /20/);
    assert.match(data.employmentPersonalized!.remainingBefore, /5,?000/);
    assert.match(data.employmentPersonalized!.remainingAfter, /7,?000/);
    assert.match(data.employmentPersonalized!.savingsAfter, /30,?000/);
  }
  console.log("PASS buildReportSummaryData: employment PDF section uses employmentBudgetResult, never the generic obligation shape");

  // --- employment: incomplete employment session (no employmentBudgetResult
  // yet) must never produce a fabricated employmentPersonalized section ----
  {
    const analysis = baseAnalysis({ contractType: "employment", typeDetails: { contractType: "employment" } });
    const data = buildReportSummaryData({
      language: "en",
      analysis,
      financialMetrics: null,
      includePersonalized: true,
      personalizedSession: EMPTY_SESSION,
      now,
    });
    assert.equal(data.employmentPersonalized, undefined, "an incomplete employment session must never be force-included");
    assert.equal(data.personalized, undefined);
  }
  console.log("PASS buildReportSummaryData: incomplete employment session never fabricates a PDF section");

  console.log("PASS reportSummary.test.ts");
}

run();
