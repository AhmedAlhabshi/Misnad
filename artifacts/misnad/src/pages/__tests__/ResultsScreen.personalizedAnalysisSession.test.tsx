import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResultsScreen from "@/pages/ResultsScreen";
import type { ContractAnalysisResult, StoredAnalysisResult } from "@/types/analysis";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function personalizedAnalysisSuccessBody() {
  return {
    success: true,
    analysis: {
      personalImpact: [{ title: "Impact title", explanation: "Impact explanation.", basis: "clause" }],
      thingsToWatch: [{ title: "Watch title", explanation: "Watch explanation.", basis: "clause" }],
      beforeYouSign: [{ type: "advice", title: "Advice title", text: "Advice text.", basis: "clause" }],
    },
  };
}

function baseAnalysis(): ContractAnalysisResult {
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
  };
}

function baseResult(overrides: Partial<StoredAnalysisResult> = {}): StoredAnalysisResult {
  return {
    analysis: baseAnalysis(),
    selectedContractType: "auto_finance",
    analysisLanguage: "en",
    fileName: "contract.pdf",
    piiStatistics: {},
    financialMetrics: null,
    financialMetricsError: null,
    documentExtraction: null,
    contractObjectUrl: null,
    contractRagSessionId: null,
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function goToFinancialAnalysisTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("tab-trigger-financialAnalysis"));
}

async function submitBudgetForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("input-monthly-income"), "10000");
  await user.type(screen.getByTestId("input-essential-expenses"), "3000");
  await user.type(screen.getByTestId("input-existing-debt"), "500");
  await user.click(screen.getByTestId("button-submit-budget-impact"));
}

describe("Personalized Analysis session state (survives tab switches, resets on new analysis)", () => {
  it("preserves the budget form, deterministic result, and AI result after navigating away and back", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(personalizedAnalysisSuccessBody()));
    const user = userEvent.setup();
    const result = baseResult();
    render(<ResultsScreen onNavigate={() => {}} analysisResult={result} />);

    await goToFinancialAnalysisTab(user);
    await submitBudgetForm(user);

    // The deterministic result renders immediately (no network call needed).
    expect(screen.getByTestId("financial-analysis-budget-impact")).toBeInTheDocument();
    // The AI personalized analysis result arrives asynchronously.
    await waitFor(() => expect(screen.getByTestId("personalized-analysis-personalImpact")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Navigate away to another result tab, then back.
    await user.click(screen.getByTestId("tab-trigger-overview"));
    expect(screen.queryByTestId("financial-analysis-budget-impact")).not.toBeInTheDocument();
    await goToFinancialAnalysisTab(user);

    // The deterministic result and the AI result are still present, exactly
    // as before — and no second network request was made.
    expect(screen.getByTestId("financial-analysis-budget-impact")).toBeInTheDocument();
    expect(screen.getByTestId("personalized-analysis-personalImpact")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The original form inputs are still present under "edit".
    await user.click(screen.getByTestId("button-edit-budget-inputs"));
    expect(screen.getByTestId("input-monthly-income")).toHaveValue(10000);
    expect(screen.getByTestId("input-essential-expenses")).toHaveValue(3000);
    expect(screen.getByTestId("input-existing-debt")).toHaveValue(500);
  });

  it("resets the personalized-analysis session when a new analysis result replaces the current one", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(personalizedAnalysisSuccessBody()));
    const user = userEvent.setup();
    const firstResult = baseResult();
    const { rerender } = render(<ResultsScreen onNavigate={() => {}} analysisResult={firstResult} />);

    await goToFinancialAnalysisTab(user);
    await submitBudgetForm(user);
    await waitFor(() => expect(screen.getByTestId("personalized-analysis-personalImpact")).toBeInTheDocument());

    // A new contract analysis completes — a brand-new StoredAnalysisResult
    // object replaces the old one (mirrors App.tsx's real flow: home -> new
    // upload -> loading -> a fresh analysisResult).
    const secondResult = baseResult({ fileName: "another-contract.pdf" });
    rerender(<ResultsScreen onNavigate={() => {}} analysisResult={secondResult} />);

    await goToFinancialAnalysisTab(user);

    // The form is shown again (not the previous result) — a fresh session.
    expect(screen.getByTestId("budget-impact-form")).toBeInTheDocument();
    expect(screen.queryByTestId("financial-analysis-budget-impact")).not.toBeInTheDocument();
    expect(screen.queryByTestId("personalized-analysis-personalImpact")).not.toBeInTheDocument();
    expect(screen.getByTestId("input-monthly-income")).toHaveValue(null);
  });

  it("never touches localStorage, sessionStorage, or cookies while running a personalized analysis", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(personalizedAnalysisSuccessBody()));
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    const result = baseResult();
    render(<ResultsScreen onNavigate={() => {}} analysisResult={result} />);

    await goToFinancialAnalysisTab(user);
    await submitBudgetForm(user);
    await waitFor(() => expect(screen.getByTestId("personalized-analysis-personalImpact")).toBeInTheDocument());

    await user.click(screen.getByTestId("tab-trigger-overview"));
    await goToFinancialAnalysisTab(user);

    expect(localStorageSpy).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
    // Confirms the only network traffic was the one, first-party personalized-analysis request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/analyze-financial-impact");
  });

  it("shows the unavailable state (not the form's previous data) when the personalized-analysis request fails, and still preserves the deterministic result across tab switches", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }, 500));
    const user = userEvent.setup();
    const result = baseResult();
    render(<ResultsScreen onNavigate={() => {}} analysisResult={result} />);

    await goToFinancialAnalysisTab(user);
    await submitBudgetForm(user);
    await waitFor(() => expect(screen.getByTestId("personalized-analysis-unavailable")).toBeInTheDocument());

    await user.click(screen.getByTestId("tab-trigger-overview"));
    await goToFinancialAnalysisTab(user);

    expect(screen.getByTestId("financial-analysis-budget-impact")).toBeInTheDocument();
    expect(screen.getByTestId("personalized-analysis-unavailable")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a retry action on failure (including a timeout), and retrying can succeed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, code: "TIMEOUT" }, 504));
    fetchMock.mockResolvedValueOnce(jsonResponse(personalizedAnalysisSuccessBody()));
    const user = userEvent.setup();
    const result = baseResult();
    render(<ResultsScreen onNavigate={() => {}} analysisResult={result} />);

    await goToFinancialAnalysisTab(user);
    await submitBudgetForm(user);
    await waitFor(() => expect(screen.getByTestId("personalized-analysis-unavailable")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The main contract results (deterministic budget-impact numbers) were
    // never reset or failed by the AI request timing out.
    expect(screen.getByTestId("financial-analysis-budget-impact")).toBeInTheDocument();

    await user.click(screen.getByTestId("button-retry-personalized-analysis"));

    await waitFor(() => expect(screen.getByTestId("personalized-analysis-personalImpact")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not issue a duplicate personalized-analysis request when the component rerenders while one is pending", async () => {
    let resolvePending: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolvePending = resolve;
        }),
    );

    const user = userEvent.setup();
    const result = baseResult();
    const { rerender } = render(<ResultsScreen onNavigate={() => {}} analysisResult={result} />);

    await goToFinancialAnalysisTab(user);
    await submitBudgetForm(user);
    await waitFor(() => expect(screen.getByTestId("personalized-analysis-loading")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Same `analysisResult` reference (same session) — a rerender of the
    // whole screen (e.g. a parent state change unrelated to this tab) must
    // never re-trigger the in-flight request.
    rerender(<ResultsScreen onNavigate={() => {}} analysisResult={result} />);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolvePending(jsonResponse(personalizedAnalysisSuccessBody()));
    await waitFor(() => expect(screen.getByTestId("personalized-analysis-personalImpact")).toBeInTheDocument());
  });

  it("keeps every other result tab fully usable while a personalized-analysis request is still pending", async () => {
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}));
    const user = userEvent.setup();
    const result = baseResult();
    render(<ResultsScreen onNavigate={() => {}} analysisResult={result} />);

    await goToFinancialAnalysisTab(user);
    await submitBudgetForm(user);
    await waitFor(() => expect(screen.getByTestId("personalized-analysis-loading")).toBeInTheDocument());

    // Only this one section is loading — the rest of the app must stay
    // fully navigable, never blocked by a pending personalized-analysis
    // request.
    await user.click(screen.getByTestId("tab-trigger-overview"));
    expect(screen.getByTestId("tab-trigger-overview")).toHaveAttribute("data-state", "active");
    expect(screen.queryByTestId("personalized-analysis-loading")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("tab-trigger-chat"));
    expect(screen.getByTestId("contract-chat")).toBeInTheDocument();

    await user.click(screen.getByTestId("tab-trigger-financialAnalysis"));
    expect(screen.getByTestId("personalized-analysis-loading")).toBeInTheDocument();
  });
});
