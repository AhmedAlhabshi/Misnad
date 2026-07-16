import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContractChat from "../ContractChat";
import ResultsScreen from "@/pages/ResultsScreen";
import { MAX_QUESTION_LENGTH } from "@/lib/chatApi";

const BASE_ANALYSIS = null;
const BASE_FINANCIAL_METRICS = null;
const VALID_SESSION_ID = "s".repeat(32);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function successBody(overrides: Partial<Record<string, unknown>> = {}) {
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

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ContractChat", () => {
  it("renders RTL for Arabic", () => {
    render(<ContractChat language="ar" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    expect(screen.getByTestId("contract-chat")).toHaveAttribute("dir", "rtl");
  });

  it("renders LTR for English", () => {
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    expect(screen.getByTestId("contract-chat")).toHaveAttribute("dir", "ltr");
  });

  it("shows the session-unavailable notice when there is no Contract RAG session", () => {
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={null} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    expect(screen.getByTestId("chat-session-unavailable-notice")).toBeInTheDocument();
    // The input must remain enabled — general/legal/financial questions can still work.
    expect(screen.getByTestId("chat-input-textarea")).not.toBeDisabled();
  });

  it("does not show the session-unavailable notice when a session exists", () => {
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    expect(screen.queryByTestId("chat-session-unavailable-notice")).not.toBeInTheDocument();
  });

  it("sends a valid question and renders the assistant's answer", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(successBody()));
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);

    await user.type(screen.getByTestId("chat-input-textarea"), "What is RAG?");
    await user.click(screen.getByTestId("chat-send-button"));

    expect(await screen.findByTestId("chat-message-user")).toHaveTextContent("What is RAG?");
    expect(await screen.findByTestId("chat-message-assistant")).toHaveTextContent("This is a grounded answer.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends a request payload containing only the allowed fields, with no route field", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(successBody()));
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="lease" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);

    await user.type(screen.getByTestId("chat-input-textarea"), "Does the lease renew automatically?");
    await user.click(screen.getByTestId("chat-send-button"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/contract-chat");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(Object.keys(body).sort()).toEqual(["answerLanguage", "contractRagSessionId", "question", "selectedContractType"]);
    expect(body).not.toHaveProperty("route");
    expect(body).not.toHaveProperty("requiredSources");
    expect(body).not.toHaveProperty("citationUrl");
    expect(body).not.toHaveProperty("chunkId");
  });

  it("sends a suggested question through the same pipeline", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(successBody()));
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);

    const suggested = screen.getByTestId("chat-suggested-question-0");
    const questionText = suggested.textContent;
    await user.click(suggested);

    expect(await screen.findByTestId("chat-message-user")).toHaveTextContent(questionText ?? "");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks sending an empty question", async () => {
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    expect(screen.getByTestId("chat-send-button")).toBeDisabled();
  });

  it("blocks sending a whitespace-only question", async () => {
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    await user.type(screen.getByTestId("chat-input-textarea"), "   ");
    expect(screen.getByTestId("chat-send-button")).toBeDisabled();
  });

  it("blocks sending an over-length question", async () => {
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    const textarea = screen.getByTestId("chat-input-textarea") as HTMLTextAreaElement;
    fireEventChange(textarea, "a".repeat(MAX_QUESTION_LENGTH + 1));
    expect(screen.getByTestId("chat-send-button")).toBeDisabled();
    expect(screen.getByTestId("chat-character-counter")).toBeInTheDocument();
  });

  it("blocks a duplicate send while a request is already in flight", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (resolveFetch = resolve)));
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);

    await user.type(screen.getByTestId("chat-input-textarea"), "How much will I pay?");
    await user.click(screen.getByTestId("chat-send-button"));
    expect(await screen.findByTestId("chat-loading-state")).toBeInTheDocument();

    // The send button must be disabled while the first request is in flight — a second click must never fire a second request.
    expect(screen.getByTestId("chat-send-button")).toBeDisabled();

    resolveFetch(jsonResponse(successBody()));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("shows the loading state while awaiting a response", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (resolveFetch = resolve)));
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);

    await user.type(screen.getByTestId("chat-input-textarea"), "Hello?");
    await user.click(screen.getByTestId("chat-send-button"));
    expect(await screen.findByTestId("chat-loading-state")).toBeInTheDocument();
    resolveFetch(jsonResponse(successBody()));
    await waitFor(() => expect(screen.queryByTestId("chat-loading-state")).not.toBeInTheDocument());
  });

  it("renders a contract citation as a label, never as a clickable external link", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        successBody({
          route: "contract",
          citations: [{ source: "contract", label: "Early Termination", citation: "Your contract — Early Termination", authority: "user_contract", excerpt: "Either party may terminate early." }],
        }),
      ),
    );
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    await user.type(screen.getByTestId("chat-input-textarea"), "What does my contract say about early termination?");
    await user.click(screen.getByTestId("chat-send-button"));

    const citation = await screen.findByTestId("chat-citation-contract");
    expect(within(citation).getByTestId("chat-citation-label")).toHaveTextContent("Early Termination");
    expect(within(citation).queryByTestId("chat-citation-official-link")).not.toBeInTheDocument();
  });

  it("renders a legal citation with authority and the exact official link the API returned", async () => {
    const officialUrl = "https://rulebook.sama.gov.sa/en/regulations-consumer-financing";
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        successBody({
          route: "legal",
          citations: [{ source: "legal", label: "Article 9", citation: officialUrl, authority: "sama", excerpt: "Fees must not exceed 1%." }],
        }),
      ),
    );
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={null} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    await user.type(screen.getByTestId("chat-input-textarea"), "What is the maximum fee under the regulations?");
    await user.click(screen.getByTestId("chat-send-button"));

    const citation = await screen.findByTestId("chat-citation-legal");
    expect(within(citation).getByTestId("chat-citation-authority")).toHaveTextContent("sama");
    const link = within(citation).getByTestId("chat-citation-official-link");
    expect(link).toHaveAttribute("href", officialUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("shows a partial-evidence warning while preserving the answer", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(successBody({ evidenceStatus: "partial" })));
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    await user.type(screen.getByTestId("chat-input-textarea"), "Is this allowed?");
    await user.click(screen.getByTestId("chat-send-button"));

    expect(await screen.findByTestId("chat-evidence-warning-partial")).toBeInTheDocument();
    expect(screen.getByTestId("chat-message-assistant")).toHaveTextContent("This is a grounded answer.");
  });

  it("shows an insufficient-evidence warning and never implies legal certainty", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(successBody({ evidenceStatus: "insufficient" })));
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    await user.type(screen.getByTestId("chat-input-textarea"), "Is this legal?");
    await user.click(screen.getByTestId("chat-send-button"));

    expect(await screen.findByTestId("chat-evidence-warning-insufficient")).toBeInTheDocument();
  });

  it("shows a user-friendly unavailable-source message without exposing internal enum names", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...successBody(), unavailableSources: ["legal"] }));
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    await user.type(screen.getByTestId("chat-input-textarea"), "Is this allowed under the regulations?");
    await user.click(screen.getByTestId("chat-send-button"));

    const notice = await screen.findByTestId("chat-unavailable-sources");
    expect(notice).toHaveTextContent("legal references");
    expect(notice.textContent).not.toMatch(/\blegal\b(?!\s+references)/); // never the bare enum word "legal" alone
  });

  it("shows a retry action for a retryable error and resends on retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ success: false, error: { code: "PROVIDER_RATE_LIMITED", message: "Busy, please try again.", retryable: true } }, 429))
      .mockResolvedValueOnce(jsonResponse(successBody()));
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    await user.type(screen.getByTestId("chat-input-textarea"), "Hello?");
    await user.click(screen.getByTestId("chat-send-button"));

    const errorMessage = await screen.findByTestId("chat-message-error");
    expect(errorMessage).toHaveTextContent("Busy, please try again.");
    const retryButton = within(errorMessage).getByTestId("chat-message-retry");

    await user.click(retryButton);
    expect(await screen.findByTestId("chat-message-assistant")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a non-retryable error without a retry action", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, error: { code: "INVALID_REQUEST", message: "Something was wrong with the request.", retryable: false } }, 400));
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    await user.type(screen.getByTestId("chat-input-textarea"), "Hello?");
    await user.click(screen.getByTestId("chat-send-button"));

    const errorMessage = await screen.findByTestId("chat-message-error");
    expect(within(errorMessage).queryByTestId("chat-message-retry")).not.toBeInTheDocument();
  });

  it("never exposes a raw server/provider error string", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED 10.0.0.5:5432 raw internal database detail"));
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    await user.type(screen.getByTestId("chat-input-textarea"), "Hello?");
    await user.click(screen.getByTestId("chat-send-button"));

    const errorMessage = await screen.findByTestId("chat-message-error");
    expect(errorMessage.textContent).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|5432/);
  });

  it("sends on Enter and inserts a newline on Shift+Enter", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(successBody()));
    const user = userEvent.setup();
    render(<ContractChat language="en" contractType="auto_finance" contractRagSessionId={VALID_SESSION_ID} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    const textarea = screen.getByTestId("chat-input-textarea") as HTMLTextAreaElement;

    await user.type(textarea, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(textarea.value).toContain("\n");

    await user.type(textarea, "line two");
    await user.keyboard("{Enter}");

    expect(await screen.findByTestId("chat-message-user")).toHaveTextContent("line one");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the chat when contractRagSessionId changes", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(successBody()));
    const user = userEvent.setup();
    const { rerender } = render(
      <ContractChat language="en" contractType="auto_finance" contractRagSessionId="session-a-aaaaaaaaaaaaaaaaaaaaaaaaaaaa" analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />,
    );
    await user.type(screen.getByTestId("chat-input-textarea"), "Hello?");
    await user.click(screen.getByTestId("chat-send-button"));
    expect(await screen.findByTestId("chat-message-assistant")).toBeInTheDocument();

    rerender(
      <ContractChat language="en" contractType="auto_finance" contractRagSessionId="session-b-bbbbbbbbbbbbbbbbbbbbbbbbbbbb" analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />,
    );

    expect(screen.queryByTestId("chat-message-assistant")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-message-user")).not.toBeInTheDocument();
  });

  it("renders without error at a narrow (mobile) viewport width", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 360 });
    render(<ContractChat language="ar" contractType="lease" contractRagSessionId={null} analysis={BASE_ANALYSIS} financialMetrics={BASE_FINANCIAL_METRICS} />);
    expect(screen.getByTestId("contract-chat")).toBeInTheDocument();
    expect(screen.getByTestId("chat-input-textarea")).toBeInTheDocument();
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: originalWidth });
  });
});

describe("ResultsScreen (chat visibility gating)", () => {
  it("never renders the chat tab before a successful analysis exists", () => {
    render(<ResultsScreen onNavigate={() => {}} analysisResult={null} />);
    expect(screen.queryByTestId("tab-trigger-chat")).not.toBeInTheDocument();
    expect(screen.queryByTestId("contract-chat")).not.toBeInTheDocument();
  });
});

/** jsdom/RTL's `user.type` is slow for very long strings — a direct change event is used only for the over-length test, where the exact keystroke sequence doesn't matter. */
function fireEventChange(element: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
