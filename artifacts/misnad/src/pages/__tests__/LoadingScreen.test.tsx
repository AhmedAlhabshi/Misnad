import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import LoadingScreen from "../LoadingScreen";
import type { PendingUpload } from "@/types/analysis";

/** Matches the private STAGE_ADVANCE_INTERVAL_MS constant inside LoadingScreen.tsx. */
const STAGE_ADVANCE_INTERVAL_MS = 900;

const STATUS_RANK: Record<string, number> = { pending: 0, active: 1, failed: 1, completed: 2 };

function currentStageRanks(): number[] {
  return [0, 1, 2, 3, 4].map(
    (i) => STATUS_RANK[screen.getByTestId(`progress-main-stage-${i}`).getAttribute("data-status")!]!,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function pendingUpload(analysisLanguage: "ar" | "en"): PendingUpload {
  return {
    file: new File(["%PDF-1.4"], "lease.pdf", { type: "application/pdf" }),
    contractType: "lease",
    analysisLanguage,
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

describe("V1 LoadingScreen", () => {
  it("renders nothing when there is no pending upload", () => {
    const { container } = render(<LoadingScreen onNavigate={vi.fn()} pendingUpload={null} onAnalysisComplete={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows exactly 5 main stages, never the old granular technical steps", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<LoadingScreen onNavigate={vi.fn()} pendingUpload={pendingUpload("en")} onAnalysisComplete={vi.fn()} />);

    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`progress-main-stage-${i}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("progress-main-stage-5")).not.toBeInTheDocument();
    expect(screen.queryByTestId("progress-stage-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("progress-stage-ocr-0")).not.toBeInTheDocument();
  });

  it("shows the first stage active with its English status line, and every later stage pending", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<LoadingScreen onNavigate={vi.fn()} pendingUpload={pendingUpload("en")} onAnalysisComplete={vi.fn()} />);

    expect(screen.getByTestId("progress-main-stage-0")).toHaveAttribute("data-status", "active");
    expect(screen.getByTestId("progress-main-stage-0-status")).toHaveTextContent("Preparing your file...");
    expect(screen.getByTestId("text-loading-heading")).toHaveTextContent("Analyzing your contract...");
    for (let i = 1; i < 5; i++) {
      expect(screen.getByTestId(`progress-main-stage-${i}`)).toHaveAttribute("data-status", "pending");
      expect(screen.queryByTestId(`progress-main-stage-${i}-status`)).not.toBeInTheDocument();
    }
  });

  it("shows Arabic labels and status line when the analysis language is Arabic", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<LoadingScreen onNavigate={vi.fn()} pendingUpload={pendingUpload("ar")} onAnalysisComplete={vi.fn()} />);

    expect(screen.getByTestId("text-loading-heading")).toHaveTextContent("جاري تحليل عقدك...");
    expect(screen.getByTestId("progress-main-stage-0")).toHaveTextContent("تجهيز العقد");
    expect(screen.getByTestId("progress-main-stage-0-status")).toHaveTextContent("جاري تجهيز الملف...");
    expect(screen.getByTestId("progress-main-stage-1")).toHaveTextContent("قراءة وفهم العقد");
    expect(screen.getByTestId("progress-main-stage-2")).toHaveTextContent("تحليل البنود والالتزامات");
    expect(screen.getByTestId("progress-main-stage-3")).toHaveTextContent("إعداد التحليل المالي");
    expect(screen.getByTestId("progress-main-stage-4")).toHaveTextContent("تجهيز التقرير");
  });

  it("completes and navigates to results on a successful response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, analysis: null, fileName: "lease.pdf", financialMetrics: null, contractRagSessionId: null }),
    );
    const onNavigate = vi.fn();
    const onAnalysisComplete = vi.fn();
    render(<LoadingScreen onNavigate={onNavigate} pendingUpload={pendingUpload("en")} onAnalysisComplete={onAnalysisComplete} />);

    await waitFor(() => expect(onAnalysisComplete).toHaveBeenCalledTimes(1));
    expect(onNavigate).toHaveBeenCalledWith("results");
    expect(onAnalysisComplete.mock.calls[0][0]).toMatchObject({ selectedContractType: "lease", analysisLanguage: "en" });
  });

  it("shows a failure state with a back-home retry action when the request fails, freezing the active stage as failed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, message: "Could not analyze" }, 500));
    render(<LoadingScreen onNavigate={vi.fn()} pendingUpload={pendingUpload("en")} onAnalysisComplete={vi.fn()} />);

    expect(await screen.findByTestId("loading-error")).toBeInTheDocument();
    expect(screen.getByTestId("button-back-home")).toBeInTheDocument();
    expect(screen.getByTestId("progress-main-stage-0")).toHaveAttribute("data-status", "failed");
  });

  it("navigates home when the retry button is clicked after a failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, message: "Could not analyze" }, 500));
    const onNavigate = vi.fn();
    render(<LoadingScreen onNavigate={onNavigate} pendingUpload={pendingUpload("en")} onAnalysisComplete={vi.fn()} />);

    const backButton = await screen.findByTestId("button-back-home");
    backButton.click();
    expect(onNavigate).toHaveBeenCalledWith("home");
  });

  it(
    "progress never regresses through a long wait (simulating OCR, backend Gemini key rotation, or provider retries) " +
      "and settles on the final stage with the extended-wait message",
    () => {
      vi.useFakeTimers();
      try {
        // The request never resolves during this test -- exactly the shape of
        // a real request that takes a long time for any internal backend
        // reason (OCR, key rotation/retries, provider fallback, slow network).
        fetchMock.mockReturnValue(new Promise(() => {}));
        render(<LoadingScreen onNavigate={vi.fn()} pendingUpload={pendingUpload("en")} onAnalysisComplete={vi.fn()} />);

        let previousRanks = currentStageRanks();

        // 8 ticks reach the auto-completed cap; several more ticks run the
        // "extended wait" range. Check after every single tick that no stage
        // ever ranks lower than it did the tick before (pending=0 < active=1
        // < completed=2) -- this is the live bug reproduced end-to-end: a
        // previous version snapped stage 4 back down to stage 1 exactly in
        // this range.
        for (let tick = 1; tick <= 14; tick++) {
          act(() => {
            vi.advanceTimersByTime(STAGE_ADVANCE_INTERVAL_MS);
          });
          const nextRanks = currentStageRanks();
          nextRanks.forEach((rank, stageIndex) => {
            expect(rank, `stage ${stageIndex} regressed on tick ${tick}`).toBeGreaterThanOrEqual(previousRanks[stageIndex]!);
          });
          previousRanks = nextRanks;
        }

        for (let i = 0; i < 4; i++) {
          expect(screen.getByTestId(`progress-main-stage-${i}`)).toHaveAttribute("data-status", "completed");
        }
        expect(screen.getByTestId("progress-main-stage-4")).toHaveAttribute("data-status", "active");
        expect(screen.getByTestId("progress-main-stage-4-status")).toHaveTextContent("Finalizing your report...");
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("Arabic extended-wait message shows on the final stage during a long wait, without any regression", () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockReturnValue(new Promise(() => {}));
      render(<LoadingScreen onNavigate={vi.fn()} pendingUpload={pendingUpload("ar")} onAnalysisComplete={vi.fn()} />);

      act(() => {
        vi.advanceTimersByTime(STAGE_ADVANCE_INTERVAL_MS * 14);
      });

      for (let i = 0; i < 4; i++) {
        expect(screen.getByTestId(`progress-main-stage-${i}`)).toHaveAttribute("data-status", "completed");
      }
      expect(screen.getByTestId("progress-main-stage-4")).toHaveAttribute("data-status", "active");
      expect(screen.getByTestId("progress-main-stage-4-status")).toHaveTextContent("جاري إنهاء التقرير...");
    } finally {
      vi.useRealTimers();
    }
  });

  it("retrying with a new pendingUpload after a real failure resets cleanly back to stage 1", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, message: "Could not analyze" }, 500));
    const { rerender } = render(
      <LoadingScreen onNavigate={vi.fn()} pendingUpload={pendingUpload("en")} onAnalysisComplete={vi.fn()} />,
    );

    await screen.findByTestId("loading-error");
    expect(screen.getByTestId("progress-main-stage-0")).toHaveAttribute("data-status", "failed");

    // A retry (or starting a fresh analysis) is a brand-new PendingUpload
    // object, exactly as App.tsx produces on every "Analyze" click -- this is
    // the only thing that is ever allowed to reset progress.
    fetchMock.mockReturnValue(new Promise(() => {}));
    rerender(<LoadingScreen onNavigate={vi.fn()} pendingUpload={pendingUpload("en")} onAnalysisComplete={vi.fn()} />);

    expect(screen.queryByTestId("loading-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("progress-main-stage-0")).toHaveAttribute("data-status", "active");
    for (let i = 1; i < 5; i++) {
      expect(screen.getByTestId(`progress-main-stage-${i}`)).toHaveAttribute("data-status", "pending");
    }
  });
});
