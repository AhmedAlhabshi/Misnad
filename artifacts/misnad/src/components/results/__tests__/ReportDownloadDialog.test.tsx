import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportDownloadDialog from "../ReportDownloadDialog";
import type { ContractAnalysisResult } from "@/types/analysis";
import type { PersonalizedAnalysisSessionState } from "@/hooks/usePersonalizedAnalysisSession";
import type { ReportSummaryData } from "@/lib/reportSummary";

const generateReportPdfBlobMock = vi.fn();
const buildReportFileNameMock = vi.fn();

vi.mock("@/lib/pdf/generateReportPdf", () => ({
  generateReportPdfBlob: (...args: unknown[]) => generateReportPdfBlobMock(...args),
  buildReportFileName: (...args: unknown[]) => buildReportFileNameMock(...args),
}));

function baseAnalysis(): ContractAnalysisResult {
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
  };
}

const IDLE_SESSION: PersonalizedAnalysisSessionState = {
  form: { monthlyIncome: "", essentialExpenses: "", existingDebt: "", savings: "" },
  budgetResult: null,
  employmentIncomeMode: null,
  employmentBudgetResult: null,
  status: "idle",
  result: null,
};

const COMPLETED_SESSION: PersonalizedAnalysisSessionState = {
  form: { monthlyIncome: "10000", essentialExpenses: "3000", existingDebt: "500", savings: "20000" },
  employmentIncomeMode: null,
  employmentBudgetResult: null,
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
    emergencyFundCoverageMonths: 2.7,
  },
  status: "success",
  result: { personalImpact: [{ title: "Affordable", explanation: "Fits your budget.", basis: "budget" }], thingsToWatch: [], beforeYouSign: [] },
};

let fetchMock: ReturnType<typeof vi.fn>;
let createObjectURLMock: ReturnType<typeof vi.fn>;
let revokeObjectURLMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  generateReportPdfBlobMock.mockReset();
  buildReportFileNameMock.mockReset();
  generateReportPdfBlobMock.mockResolvedValue(new Blob(["fake pdf bytes"], { type: "application/pdf" }));
  buildReportFileNameMock.mockReturnValue("misnad-contract-summary-2026-03-15.pdf");

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
  revokeObjectURLMock = vi.fn();
  // jsdom's global URL has no createObjectURL/revokeObjectURL at all — add
  // them directly on the real URL class (never replace URL itself, which
  // would break jsdom internals like document.cookie that expect a real
  // URL constructor).
  Object.defineProperty(URL, "createObjectURL", { value: createObjectURLMock, writable: true, configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURLMock, writable: true, configurable: true });
});

afterEach(() => {
  delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
  vi.unstubAllGlobals();
});

function renderDialog(overrides: { personalizedSessionState?: PersonalizedAnalysisSessionState; open?: boolean } = {}) {
  const onOpenChange = vi.fn();
  const onNavigateToPersonalizedAnalysis = vi.fn();
  render(
    <ReportDownloadDialog
      open={overrides.open ?? true}
      onOpenChange={onOpenChange}
      language="en"
      contractType="auto_finance"
      analysis={baseAnalysis()}
      financialMetrics={null}
      personalizedSessionState={overrides.personalizedSessionState ?? IDLE_SESSION}
      onNavigateToPersonalizedAnalysis={onNavigateToPersonalizedAnalysis}
    />,
  );
  return { onOpenChange, onNavigateToPersonalizedAnalysis };
}

describe("ReportDownloadDialog", () => {
  it("is not rendered when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByTestId("report-download-dialog")).not.toBeInTheDocument();
  });

  it("opens with Option A selected by default and Option B disabled when personalized analysis is incomplete", () => {
    renderDialog({ personalizedSessionState: IDLE_SESSION });
    expect(screen.getByTestId("report-download-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("report-option-contract-only")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("report-option-with-personalized")).toBeDisabled();
    expect(screen.getByTestId("report-option-b-unavailable-notice")).toBeInTheDocument();
  });

  it("enables Option B once the personalized analysis is completed", () => {
    renderDialog({ personalizedSessionState: COMPLETED_SESSION });
    expect(screen.getByTestId("report-option-with-personalized")).not.toBeDisabled();
    expect(screen.queryByTestId("report-option-b-unavailable-notice")).not.toBeInTheDocument();
  });

  it("navigates to Personalized Analysis and closes the dialog when the notice's link is clicked", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onNavigateToPersonalizedAnalysis } = renderDialog({ personalizedSessionState: IDLE_SESSION });
    await user.click(screen.getByTestId("button-go-to-personalized-analysis"));
    expect(onNavigateToPersonalizedAnalysis).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("generates and downloads a contract-only report using Option A without any network request", async () => {
    const user = userEvent.setup();
    renderDialog({ personalizedSessionState: IDLE_SESSION });

    await user.click(screen.getByTestId("button-generate-report"));

    await waitFor(() => expect(generateReportPdfBlobMock).toHaveBeenCalledTimes(1));
    const dataArg = generateReportPdfBlobMock.mock.calls[0]![0] as ReportSummaryData;
    expect(dataArg.language).toBe("en");
    expect(dataArg.personalized).toBeUndefined();
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("generates a personalized report using Option B when selected and available", async () => {
    const user = userEvent.setup();
    renderDialog({ personalizedSessionState: COMPLETED_SESSION });

    await user.click(screen.getByTestId("report-option-with-personalized"));
    await user.click(screen.getByTestId("button-generate-report"));

    await waitFor(() => expect(generateReportPdfBlobMock).toHaveBeenCalledTimes(1));
    const dataArg = generateReportPdfBlobMock.mock.calls[0]![0] as ReportSummaryData;
    expect(dataArg.personalized).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes the dialog after a successful download", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog({ personalizedSessionState: IDLE_SESSION });
    await user.click(screen.getByTestId("button-generate-report"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("never touches localStorage, sessionStorage, or cookies, and never logs financial inputs while generating a personalized report", async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    renderDialog({ personalizedSessionState: COMPLETED_SESSION });

    await user.click(screen.getByTestId("report-option-with-personalized"));
    await user.click(screen.getByTestId("button-generate-report"));
    await waitFor(() => expect(generateReportPdfBlobMock).toHaveBeenCalledTimes(1));

    expect(localStorageSpy).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();

    const allLoggedText = [...consoleLogSpy.mock.calls, ...consoleErrorSpy.mock.calls].flat().map(String).join(" ");
    // The completed session's actual financial figures must never appear in any log line.
    expect(allLoggedText).not.toContain("10000");
    expect(allLoggedText).not.toContain("6500");
    expect(allLoggedText).not.toContain("Affordable");

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("never triggers generation just by clicking Option B when it is disabled", async () => {
    const user = userEvent.setup();
    renderDialog({ personalizedSessionState: IDLE_SESSION });
    await user.click(screen.getByTestId("report-option-with-personalized"));
    // Option B stays not-pressed since it is disabled and the click had no effect.
    expect(screen.getByTestId("report-option-with-personalized")).toHaveAttribute("aria-pressed", "false");
  });
});
