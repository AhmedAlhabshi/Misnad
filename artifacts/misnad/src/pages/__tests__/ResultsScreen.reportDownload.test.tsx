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
      personalImpact: [{ title: "Affordable", explanation: "Fits your budget.", basis: "budget" }],
      thingsToWatch: [],
      beforeYouSign: [],
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
});

async function completePersonalizedAnalysis(user: ReturnType<typeof userEvent.setup>) {
  fetchMock.mockResolvedValueOnce(jsonResponse(personalizedAnalysisSuccessBody()));
  await user.click(screen.getByTestId("tab-trigger-financialAnalysis"));
  await user.type(screen.getByTestId("input-monthly-income"), "10000");
  await user.type(screen.getByTestId("input-essential-expenses"), "3000");
  await user.type(screen.getByTestId("input-existing-debt"), "500");
  await user.click(screen.getByTestId("button-submit-budget-impact"));
  await waitFor(() => expect(screen.getByTestId("personalized-analysis-personalImpact")).toBeInTheDocument());
}

describe("Report Download dialog integration with ResultsScreen", () => {
  it("opens the report dialog from the header button on any tab", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen onNavigate={() => {}} analysisResult={baseResult()} />);
    await user.click(screen.getByTestId("button-open-report-dialog"));
    expect(screen.getByTestId("report-download-dialog")).toBeInTheDocument();
  });

  it("Option B stays disabled before any personalized analysis has been completed", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen onNavigate={() => {}} analysisResult={baseResult()} />);
    await user.click(screen.getByTestId("button-open-report-dialog"));
    expect(screen.getByTestId("report-option-with-personalized")).toBeDisabled();
  });

  it("navigating to Personalized Analysis from the dialog actually switches the active tab", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen onNavigate={() => {}} analysisResult={baseResult()} />);
    await user.click(screen.getByTestId("button-open-report-dialog"));
    await user.click(screen.getByTestId("button-go-to-personalized-analysis"));
    expect(screen.getByTestId("budget-impact-form")).toBeInTheDocument();
  });

  it("Option B becomes enabled once personalized analysis completes, and stays enabled after switching away and back to other tabs", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen onNavigate={() => {}} analysisResult={baseResult()} />);

    await completePersonalizedAnalysis(user);

    // Switch to Overview, then Document, then back — the durable session state must survive.
    await user.click(screen.getByTestId("tab-trigger-overview"));
    await user.click(screen.getByTestId("tab-trigger-contract"));
    await user.click(screen.getByTestId("tab-trigger-overview"));

    await user.click(screen.getByTestId("button-open-report-dialog"));
    expect(screen.getByTestId("report-option-with-personalized")).not.toBeDisabled();
    expect(screen.queryByTestId("report-option-b-unavailable-notice")).not.toBeInTheDocument();
  });

  it("resets Option B back to unavailable when a new analysis result replaces the current one", async () => {
    const user = userEvent.setup();
    const firstResult = baseResult();
    const { rerender } = render(<ResultsScreen onNavigate={() => {}} analysisResult={firstResult} />);

    await completePersonalizedAnalysis(user);
    await user.click(screen.getByTestId("button-open-report-dialog"));
    expect(screen.getByTestId("report-option-with-personalized")).not.toBeDisabled();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("report-download-dialog")).not.toBeInTheDocument());

    // A new contract analysis completes — a fresh StoredAnalysisResult replaces the old one.
    const secondResult = baseResult({ fileName: "another-contract.pdf" });
    rerender(<ResultsScreen onNavigate={() => {}} analysisResult={secondResult} />);

    await user.click(screen.getByTestId("button-open-report-dialog"));
    expect(screen.getByTestId("report-option-with-personalized")).toBeDisabled();
    expect(screen.getByTestId("report-option-b-unavailable-notice")).toBeInTheDocument();
  });
});
