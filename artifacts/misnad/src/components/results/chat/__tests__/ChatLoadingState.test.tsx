import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import ChatLoadingState from "../ChatLoadingState";
import { RESULTS_COPY } from "@/lib/resultsCopy";

const STAGE_ADVANCE_INTERVAL_MS = 1800;

describe("ChatLoadingState", () => {
  it("shows the first stage immediately on mount", () => {
    render(<ChatLoadingState language="en" />);
    expect(screen.getByTestId("chat-loading-stage-label")).toHaveTextContent(RESULTS_COPY.en.chat.loadingStages[0]!);
  });

  it("advances through each stage in order, one tick at a time, never skipping or repeating out of order", () => {
    vi.useFakeTimers();
    try {
      render(<ChatLoadingState language="en" />);
      const stages = RESULTS_COPY.en.chat.loadingStages;

      for (let i = 1; i < stages.length; i++) {
        act(() => {
          vi.advanceTimersByTime(STAGE_ADVANCE_INTERVAL_MS);
        });
        expect(screen.getByTestId("chat-loading-stage-label")).toHaveTextContent(stages[i]!);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it(
    "never wraps back to stage 1 (regression: a previous version used `(index + 1) % length`, which visibly " +
      "restarted the sequence during a long-running request) — instead shows the extended-wait message and stays there",
    () => {
      vi.useFakeTimers();
      try {
        render(<ChatLoadingState language="en" />);
        const stages = RESULTS_COPY.en.chat.loadingStages;
        const seenLabels: string[] = [screen.getByTestId("chat-loading-stage-label").textContent!];

        // Tick well past the point where every stage has been shown.
        for (let tick = 1; tick <= stages.length + 6; tick++) {
          act(() => {
            vi.advanceTimersByTime(STAGE_ADVANCE_INTERVAL_MS);
          });
          seenLabels.push(screen.getByTestId("chat-loading-stage-label").textContent!);
        }

        // The first stage's label must never reappear after it's been left behind.
        const firstStageLabel = stages[0]!;
        const lastIndexOfFirstStage = seenLabels.lastIndexOf(firstStageLabel);
        expect(lastIndexOfFirstStage).toBe(0);

        // It must settle on, and stay on, the extended-wait message.
        expect(screen.getByTestId("chat-loading-stage-label")).toHaveTextContent(RESULTS_COPY.en.chat.extendedWaitMessage);
        const tail = seenLabels.slice(-3);
        expect(tail.every((label) => label === RESULTS_COPY.en.chat.extendedWaitMessage)).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("shows the Arabic stages and extended-wait message in order", () => {
    vi.useFakeTimers();
    try {
      render(<ChatLoadingState language="ar" />);
      const stages = RESULTS_COPY.ar.chat.loadingStages;
      expect(screen.getByTestId("chat-loading-stage-label")).toHaveTextContent(stages[0]!);

      act(() => {
        vi.advanceTimersByTime(STAGE_ADVANCE_INTERVAL_MS * (stages.length + 2));
      });
      expect(screen.getByTestId("chat-loading-stage-label")).toHaveTextContent(RESULTS_COPY.ar.chat.extendedWaitMessage);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets to stage 1 on remount (a genuinely new request), never carrying over the previous request's progress", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<ChatLoadingState language="en" />);
      act(() => {
        vi.advanceTimersByTime(STAGE_ADVANCE_INTERVAL_MS * 3);
      });
      expect(screen.getByTestId("chat-loading-stage-label")).not.toHaveTextContent(RESULTS_COPY.en.chat.loadingStages[0]!);
      unmount();

      render(<ChatLoadingState language="en" />);
      expect(screen.getByTestId("chat-loading-stage-label")).toHaveTextContent(RESULTS_COPY.en.chat.loadingStages[0]!);
    } finally {
      vi.useRealTimers();
    }
  });
});
