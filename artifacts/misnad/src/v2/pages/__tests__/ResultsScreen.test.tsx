import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { calculateFinancialMetrics } from "@workspace/financial-metrics";
import type { ContractAnalysisResult } from "@/types/analysis";
import type { StoredAnalysisResult } from "@/types/analysis";
import ResultsScreen from "../ResultsScreen";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function chatSuccessBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    success: true,
    route: "general",
    unavailableSources: [],
    warnings: [],
    answer: {
      answer: "This is a grounded answer.",
      language: "EN",
      route: "general",
      confidence: "high",
      evidenceStatus: "sufficient",
      citations: [],
      usedFinancialFactKeys: [],
      warnings: [],
      provider: "gemini",
      ...overrides,
    },
  };
}

function buildFixtureAnalysis(): ContractAnalysisResult {
  return {
    contractType: "auto_finance",
    contractSummary: "A vehicle financing agreement between the buyer and the finance company.",
    contractSummarySimple: "You are financing a car and paying it back monthly.",
    parties: [{ role: "Buyer", name: "Test Buyer", identifier: null, notes: null }],
    financialObligations: [
      { description: "Total of Payments during the financing term", amount: 115200, currency: "SAR", frequency: null, dueDate: null },
      { description: "Total repayment amount", amount: 134400, currency: "SAR", frequency: null, dueDate: null },
      { description: "Vehicle Cash Price", amount: 120000, currency: "SAR", frequency: null, dueDate: null },
    ],
    dates: [],
    penalties: [{ description: "Actual collection costs", amount: 500, currency: "SAR", condition: "up to 500 SAR if collection action is required" }],
    fees: [{ description: "Administrative fee", amount: 1200, currency: "SAR", isRecurring: false }],
    importantClauses: [
      {
        title: "Early termination penalty",
        summary: "The buyer must pay a fee to end the contract early.",
        plainExplanation: "If you stop paying early, you'll owe an extra fee.",
        riskLevel: "high",
        evidence: null,
      },
      {
        title: "Insurance requirement",
        summary: "The vehicle must remain insured throughout the term.",
        plainExplanation: "You must keep the car insured the whole time.",
        riskLevel: "low",
        evidence: null,
      },
    ],
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

function buildFixtureResult(): StoredAnalysisResult {
  const analysis = buildFixtureAnalysis();
  const financialMetrics = calculateFinancialMetrics(analysis as unknown as Parameters<typeof calculateFinancialMetrics>[0]);
  return {
    analysis,
    selectedContractType: "auto_finance",
    analysisLanguage: "en",
    fileName: "fixture.pdf",
    piiStatistics: {},
    financialMetrics,
    financialMetricsError: null,
    documentExtraction: null,
    contractObjectUrl: null,
    contractRagSessionId: "s".repeat(32),
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

describe("V2 ResultsScreen", () => {
  it("shows an empty state and no tabs when there is no analysis result", () => {
    render(<ResultsScreen onNavigate={vi.fn()} analysisResult={null} />);
    expect(screen.queryByTestId("tab-trigger-overview")).not.toBeInTheDocument();
  });

  it("renders all seven section tabs for a completed analysis", () => {
    render(<ResultsScreen onNavigate={vi.fn()} analysisResult={buildFixtureResult()} />);
    for (const tab of ["overview", "executiveSummary", "financialObligations", "clauses", "insights", "chat", "document"]) {
      expect(screen.getByTestId(`tab-trigger-${tab}`)).toBeInTheDocument();
    }
  });

  it("shows the contract overview stat strip with a risk badge and title", () => {
    render(<ResultsScreen onNavigate={vi.fn()} analysisResult={buildFixtureResult()} />);
    expect(screen.getByTestId("text-contract-title")).toBeInTheDocument();
    expect(screen.getByTestId("stat-strip")).toBeInTheDocument();
    expect(screen.getByTestId("risk-badge-high")).toBeInTheDocument();
  });

  it("surfaces the high-risk clause in the Executive Summary tab", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen onNavigate={vi.fn()} analysisResult={buildFixtureResult()} />);
    await user.click(screen.getByTestId("tab-trigger-executiveSummary"));
    expect(await screen.findByTestId("executive-finding-risk_clause")).toHaveTextContent("Early termination penalty");
  });

  it("shows risk badges on clauses in the Clauses tab", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen onNavigate={vi.fn()} analysisResult={buildFixtureResult()} />);
    await user.click(screen.getByTestId("tab-trigger-clauses"));
    expect(await screen.findByTestId("clause-item-0")).toBeInTheDocument();
    expect(within(screen.getByTestId("clause-item-0")).getByTestId("risk-badge-high")).toBeInTheDocument();
  });

  it("renders grouped financial obligations", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen onNavigate={vi.fn()} analysisResult={buildFixtureResult()} />);
    await user.click(screen.getByTestId("tab-trigger-financialObligations"));
    expect(await screen.findByTestId("contract-financial-facts")).toBeInTheDocument();
  });

  it("sends a chat question and renders the assistant's answer with no route field in the request", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(chatSuccessBody()));
    const user = userEvent.setup();
    render(<ResultsScreen onNavigate={vi.fn()} analysisResult={buildFixtureResult()} />);
    await user.click(screen.getByTestId("tab-trigger-chat"));

    await user.type(screen.getByTestId("chat-input-textarea"), "What is the early termination fee?");
    await user.click(screen.getByTestId("chat-send-button"));

    expect(await screen.findByTestId("chat-message-assistant")).toHaveTextContent("This is a grounded answer.");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/contract-chat");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).not.toHaveProperty("route");
  });

  it("renders a legal citation with the exact official link and shows a retry action on a retryable error", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ success: false, error: { code: "PROVIDER_RATE_LIMITED", message: "Busy, try again.", retryable: true } }, 429))
      .mockResolvedValueOnce(
        jsonResponse(chatSuccessBody({ citations: [{ source: "legal", label: "Article 9", citation: "https://laws.moj.gov.sa/x", authority: "MOJ", excerpt: "Text." }] })),
      );
    const user = userEvent.setup();
    render(<ResultsScreen onNavigate={vi.fn()} analysisResult={buildFixtureResult()} />);
    await user.click(screen.getByTestId("tab-trigger-chat"));

    await user.type(screen.getByTestId("chat-input-textarea"), "Is this legal?");
    await user.click(screen.getByTestId("chat-send-button"));

    const errorMessage = await screen.findByTestId("chat-message-error");
    await user.click(within(errorMessage).getByTestId("chat-message-retry"));

    const citation = await screen.findByTestId("chat-citation-legal");
    const link = within(citation).getByTestId("chat-citation-official-link");
    expect(link).toHaveAttribute("href", "https://laws.moj.gov.sa/x");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows the PDF-unavailable empty state on the Document tab when no object URL exists", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen onNavigate={vi.fn()} analysisResult={buildFixtureResult()} />);
    await user.click(screen.getByTestId("tab-trigger-document"));
    expect(await screen.findByTestId("contract-viewer-unavailable")).toBeInTheDocument();
  });
});
