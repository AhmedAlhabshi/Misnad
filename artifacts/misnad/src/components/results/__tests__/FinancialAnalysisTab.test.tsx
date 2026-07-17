import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FinancialMetrics, MoneyMetric } from "@workspace/financial-metrics";
import FinancialAnalysisTab from "../FinancialAnalysisTab";
import { usePersonalizedAnalysisSession } from "@/hooks/usePersonalizedAnalysisSession";
import type { ContractAnalysisResult } from "@/types/analysis";
import { RESULTS_COPY } from "@/lib/resultsCopy";

function knownMoney(value: number, currency = "SAR"): MoneyMetric {
  return { value, currency, status: "known", source: "test", reason: null, confidence: "high" };
}

function unavailableMoney(): MoneyMetric {
  return { value: null, currency: null, status: "unavailable", source: null, reason: "n/a", confidence: "low" };
}

function unavailablePercentage() {
  return { value: null, status: "unavailable" as const, source: null, reason: "n/a", confidence: "low" as const };
}

/** Minimal employment fixture: only carries the one `monthly_income` informational amount that `selectGuaranteedEmploymentIncome` reads — everything else stays "unavailable", matching the actual engine output shape. */
function employmentFinancialMetrics(guaranteedMonthlyIncome: number): FinancialMetrics {
  return {
    schemaVersion: "1.0",
    currency: "SAR",
    paymentObligations: [],
    informationalAmounts: [
      {
        id: "guaranteed-income",
        type: "monthly_income",
        label: "Guaranteed monthly employment income",
        amount: knownMoney(guaranteedMonthlyIncome),
        percentage: unavailablePercentage(),
        financialRole: "income",
        sourceFields: [],
      },
    ],
    recurringCommitment: {
      actualMonthlyAmount: unavailableMoney(),
      monthlyEquivalent: unavailableMoney(),
      annualEquivalent: unavailableMoney(),
      minimumMonthlyAmount: unavailableMoney(),
      maximumMonthlyAmount: unavailableMoney(),
      isVariable: null,
      includedObligationIds: [],
    },
    contractDuration: {
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
      items: [],
      totalKnownFees: unavailableMoney(),
      mandatoryFees: unavailableMoney(),
      upfrontFees: unavailableMoney(),
      recurringFees: unavailableMoney(),
      conditionalFees: unavailableMoney(),
      hasUndefinedFees: null,
      status: "unavailable",
    },
    penalties: { items: [], totalKnownPenalties: unavailableMoney(), highestKnownPenalty: unavailableMoney(), hasUndefinedPenalty: null, status: "unavailable" },
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

const fetchPersonalizedAnalysisMock = vi.fn();

vi.mock("@/lib/personalizedAnalysisApi", () => ({
  fetchPersonalizedAnalysis: (...args: unknown[]) => fetchPersonalizedAnalysisMock(...args),
}));

function baseAnalysis(overrides: Partial<ContractAnalysisResult> = {}): ContractAnalysisResult {
  return {
    contractType: "auto_finance",
    contractSummary: "A test contract.",
    contractSummarySimple: "A simple test contract.",
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

function employmentAnalysis(): ContractAnalysisResult {
  return baseAnalysis({ contractType: "employment", typeDetails: { contractType: "employment" } });
}

/** Owns the session hook exactly like `ResultsScreen` does — lets tests unmount/remount `FinancialAnalysisTab` (simulating a tab switch) while the session survives, and re-select a mode after "editing". */
function Harness({
  analysis,
  mounted = true,
  financialMetrics = null,
}: {
  analysis: ContractAnalysisResult;
  mounted?: boolean;
  financialMetrics?: FinancialMetrics | null;
}) {
  const session = usePersonalizedAnalysisSession(analysis);
  if (!mounted) {
    return null;
  }
  return <FinancialAnalysisTab analysis={analysis} financialMetrics={financialMetrics} language="en" session={session} />;
}

async function fillBaseInputs(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("input-monthly-income"), "10000");
  await user.type(screen.getByTestId("input-essential-expenses"), "4000");
  await user.type(screen.getByTestId("input-existing-debt"), "1000");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("FinancialAnalysisTab — employment income-mode flow", () => {
  beforeEach(() => {
    fetchPersonalizedAnalysisMock.mockReset();
  });

  it("shows the income-mode question only for employment contracts", () => {
    render(<Harness analysis={employmentAnalysis()} />);
    expect(screen.getByTestId("employment-income-mode-question")).toBeInTheDocument();
  });

  it("never shows the income-mode question for a non-employment contract", () => {
    render(<Harness analysis={baseAnalysis({ contractType: "auto_finance" })} />);
    expect(screen.queryByTestId("employment-income-mode-question")).not.toBeInTheDocument();
  });

  it("renders the exact mode-question copy", () => {
    render(<Harness analysis={employmentAnalysis()} />);
    const copy = RESULTS_COPY.en.financialAnalysis.employmentIncomeMode;
    expect(screen.getByText(copy.title)).toBeInTheDocument();
    expect(screen.getByText(copy.replaceOptionTitle)).toBeInTheDocument();
    expect(screen.getByText(copy.replaceOptionDescription)).toBeInTheDocument();
    expect(screen.getByText(copy.addOptionTitle)).toBeInTheDocument();
    expect(screen.getByText(copy.addOptionDescription)).toBeInTheDocument();
  });

  it("keeps the submit button disabled until a mode is selected, even with all three base inputs filled", async () => {
    const user = userEvent.setup();
    render(<Harness analysis={employmentAnalysis()} />);
    await fillBaseInputs(user);
    expect(screen.getByTestId("button-submit-budget-impact")).toBeDisabled();

    await user.click(screen.getByTestId("option-employment-mode-replace"));
    expect(screen.getByTestId("button-submit-budget-impact")).not.toBeDisabled();
  });

  it("never runs an employment analysis before a mode is selected, even if the button were force-submitted", async () => {
    const user = userEvent.setup();
    render(<Harness analysis={employmentAnalysis()} />);
    await fillBaseInputs(user);
    // The button is disabled (verified above); attempting to click it anyway must be a no-op.
    await user.click(screen.getByTestId("button-submit-budget-impact"));
    expect(fetchPersonalizedAnalysisMock).not.toHaveBeenCalled();
  });

  it("submits with the selected mode and renders employment result labels, never generic obligation labels", async () => {
    fetchPersonalizedAnalysisMock.mockResolvedValue({
      success: true,
      data: { personalImpact: [], thingsToWatch: [], beforeYouSign: [] },
    });
    const user = userEvent.setup();
    render(<Harness analysis={employmentAnalysis()} financialMetrics={employmentFinancialMetrics(12000)} />);
    await fillBaseInputs(user);
    await user.click(screen.getByTestId("option-employment-mode-replace"));
    await user.click(screen.getByTestId("button-submit-budget-impact"));

    await waitFor(() => expect(fetchPersonalizedAnalysisMock).toHaveBeenCalledTimes(1));
    const payload = fetchPersonalizedAnalysisMock.mock.calls[0]![0];
    expect(payload.employmentIncomeMode).toBe("replace_current_income");
    expect(payload.incomeAfter).toBe(12000);

    const empCopy = RESULTS_COPY.en.financialAnalysis.employmentBudgetImpact;
    expect(screen.getByTestId("financial-analysis-employment-budget-impact")).toBeInTheDocument();
    expect(screen.getByText(empCopy.incomeBeforeLabel)).toBeInTheDocument();
    expect(screen.getByText(empCopy.incomeAfterLabel)).toBeInTheDocument();
    expect(screen.getByTestId("row-income-after")).toHaveTextContent("12,000");
    // The generic, obligation-oriented labels must never appear for employment.
    const budgetImpactCopy = RESULTS_COPY.en.financialAnalysis.budgetImpact;
    expect(screen.queryByText(budgetImpactCopy.contractIncomeRatioLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(budgetImpactCopy.totalCommitmentRatioLabel)).not.toBeInTheDocument();
  });

  it("changing the mode after editing discards the old result and fires a fresh analysis under the new mode", async () => {
    fetchPersonalizedAnalysisMock.mockResolvedValue({
      success: true,
      data: { personalImpact: [], thingsToWatch: [], beforeYouSign: [] },
    });
    const user = userEvent.setup();
    render(<Harness analysis={employmentAnalysis()} />);
    await fillBaseInputs(user);
    await user.click(screen.getByTestId("option-employment-mode-replace"));
    await user.click(screen.getByTestId("button-submit-budget-impact"));
    await waitFor(() => expect(fetchPersonalizedAnalysisMock).toHaveBeenCalledTimes(1));
    expect(fetchPersonalizedAnalysisMock.mock.calls[0]![0].employmentIncomeMode).toBe("replace_current_income");

    await user.click(screen.getByTestId("button-edit-budget-inputs"));
    expect(screen.getByTestId("employment-income-mode-question")).toBeInTheDocument();
    // Selecting the OTHER mode must not resurrect the previous mode's result.
    await user.click(screen.getByTestId("option-employment-mode-add"));
    expect(screen.queryByTestId("financial-analysis-employment-budget-impact")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("button-submit-budget-impact"));
    await waitFor(() => expect(fetchPersonalizedAnalysisMock).toHaveBeenCalledTimes(2));
    expect(fetchPersonalizedAnalysisMock.mock.calls[1]![0].employmentIncomeMode).toBe("add_to_current_income");
  });

  it("never fires a second request merely because the tab unmounts and remounts (simulated tab switch)", async () => {
    const first = deferred<{ success: true; data: { personalImpact: never[]; thingsToWatch: never[]; beforeYouSign: never[] } }>();
    fetchPersonalizedAnalysisMock.mockReturnValue(first.promise);
    const user = userEvent.setup();
    const analysis = employmentAnalysis();
    const { rerender } = render(<Harness analysis={analysis} mounted />);
    await fillBaseInputs(user);
    await user.click(screen.getByTestId("option-employment-mode-replace"));
    await user.click(screen.getByTestId("button-submit-budget-impact"));
    expect(fetchPersonalizedAnalysisMock).toHaveBeenCalledTimes(1);

    // Simulate switching away from this results tab (unmount) and back (remount) while the request is still pending.
    rerender(<Harness analysis={analysis} mounted={false} />);
    rerender(<Harness analysis={analysis} mounted />);
    expect(fetchPersonalizedAnalysisMock).toHaveBeenCalledTimes(1);

    first.resolve({ success: true, data: { personalImpact: [], thingsToWatch: [], beforeYouSign: [] } });
    await waitFor(() => expect(screen.getByTestId("financial-analysis-employment-budget-impact")).toBeInTheDocument());
    expect(fetchPersonalizedAnalysisMock).toHaveBeenCalledTimes(1);
  });

  it("never fires a duplicate request from a fast double-click on Retry", async () => {
    const first = deferred<{ success: false }>();
    fetchPersonalizedAnalysisMock.mockReturnValueOnce(first.promise);
    const user = userEvent.setup();
    render(<Harness analysis={employmentAnalysis()} />);
    await fillBaseInputs(user);
    await user.click(screen.getByTestId("option-employment-mode-replace"));
    await user.click(screen.getByTestId("button-submit-budget-impact"));
    expect(fetchPersonalizedAnalysisMock).toHaveBeenCalledTimes(1);

    first.resolve({ success: false });
    await waitFor(() => expect(screen.getByTestId("button-retry-personalized-analysis")).toBeInTheDocument());

    const second = deferred<{ success: false }>();
    fetchPersonalizedAnalysisMock.mockReturnValueOnce(second.promise);
    const retryButton = screen.getByTestId("button-retry-personalized-analysis");
    // Two rapid clicks before the retry's own request resolves — only one new request may be in flight.
    await user.click(retryButton);
    await user.click(retryButton);
    expect(fetchPersonalizedAnalysisMock).toHaveBeenCalledTimes(2);

    second.resolve({ success: false });
    await waitFor(() => expect(screen.getByTestId("button-retry-personalized-analysis")).toBeInTheDocument());
    expect(fetchPersonalizedAnalysisMock).toHaveBeenCalledTimes(2);
  });
});
