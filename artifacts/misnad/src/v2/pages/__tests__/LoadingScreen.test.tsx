import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LoadingScreen from "../LoadingScreen";
import type { PendingUpload } from "@/types/analysis";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const PENDING_UPLOAD: PendingUpload = {
  file: new File(["%PDF-1.4"], "lease.pdf", { type: "application/pdf" }),
  contractType: "lease",
  analysisLanguage: "ar",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("V2 LoadingScreen", () => {
  it("renders nothing when there is no pending upload", () => {
    const { container } = render(<LoadingScreen onNavigate={vi.fn()} pendingUpload={null} onAnalysisComplete={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the analyzing heading and a progress timeline while the request is in flight", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<LoadingScreen onNavigate={vi.fn()} pendingUpload={PENDING_UPLOAD} onAnalysisComplete={vi.fn()} />);

    expect(screen.getByTestId("text-loading-heading")).toBeInTheDocument();
    expect(screen.getByTestId("progress-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("loading-progress-bar")).toBeInTheDocument();
  });

  it("completes and navigates to results on a successful response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        analysis: null,
        fileName: "lease.pdf",
        financialMetrics: null,
        contractRagSessionId: null,
      }),
    );
    const onNavigate = vi.fn();
    const onAnalysisComplete = vi.fn();
    render(<LoadingScreen onNavigate={onNavigate} pendingUpload={PENDING_UPLOAD} onAnalysisComplete={onAnalysisComplete} />);

    await waitFor(() => expect(onAnalysisComplete).toHaveBeenCalledTimes(1));
    expect(onNavigate).toHaveBeenCalledWith("results");
    expect(onAnalysisComplete.mock.calls[0][0]).toMatchObject({ selectedContractType: "lease", analysisLanguage: "ar" });
  });

  it("shows a failure state with a back-home action when the request fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, message: "تعذر التحليل" }, 500));
    render(<LoadingScreen onNavigate={vi.fn()} pendingUpload={PENDING_UPLOAD} onAnalysisComplete={vi.fn()} />);

    expect(await screen.findByTestId("loading-error")).toBeInTheDocument();
    expect(screen.getByTestId("button-back-home")).toBeInTheDocument();
  });
});
