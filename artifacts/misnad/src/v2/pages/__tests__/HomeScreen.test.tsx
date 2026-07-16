import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HomeScreen from "../HomeScreen";

function makeFile(name = "contract.pdf", type = "application/pdf"): File {
  return new File(["%PDF-1.4 test"], name, { type });
}

describe("V2 HomeScreen", () => {
  it("keeps the CTA disabled until type, language, and file are all chosen", async () => {
    const user = userEvent.setup();
    render(<HomeScreen onNavigate={vi.fn()} onStartAnalysis={vi.fn()} />);

    expect(screen.getByTestId("button-analyze-contract")).toBeDisabled();

    await user.click(screen.getByTestId("chip-contract-type-lease"));
    expect(screen.getByTestId("button-analyze-contract")).toBeDisabled();

    await user.click(screen.getByTestId("chip-analysis-language-ar"));
    expect(screen.getByTestId("button-analyze-contract")).toBeDisabled();
  });

  it("rejects a non-PDF file with an inline error", async () => {
    render(<HomeScreen onNavigate={vi.fn()} onStartAnalysis={vi.fn()} />);

    // `userEvent.upload` respects the input's `accept` filter and silently
    // skips a mismatched file — `fireEvent.change` bypasses that so the
    // component's own runtime type check (not the browser's file picker) is
    // what's under test here.
    const input = screen.getByTestId("input-file-upload") as HTMLInputElement;
    const badFile = makeFile("resume.docx", "application/msword");
    fireEvent.change(input, { target: { files: [badFile] } });

    expect(await screen.findByTestId("text-upload-error")).toBeInTheDocument();
    expect(screen.queryByTestId("text-selected-file")).not.toBeInTheDocument();
  });

  it("starts analysis with the selected type/language/file and navigates to loading", async () => {
    const onNavigate = vi.fn();
    const onStartAnalysis = vi.fn();
    const user = userEvent.setup();
    render(<HomeScreen onNavigate={onNavigate} onStartAnalysis={onStartAnalysis} />);

    await user.click(screen.getByTestId("chip-contract-type-lease"));
    await user.click(screen.getByTestId("chip-analysis-language-ar"));
    const input = screen.getByTestId("input-file-upload") as HTMLInputElement;
    const file = makeFile();
    await user.upload(input, file);

    expect(await screen.findByTestId("text-selected-file")).toHaveTextContent("contract.pdf");
    expect(screen.getByTestId("button-analyze-contract")).not.toBeDisabled();

    await user.click(screen.getByTestId("button-analyze-contract"));

    expect(onStartAnalysis).toHaveBeenCalledWith({ file, contractType: "lease", analysisLanguage: "ar" });
    expect(onNavigate).toHaveBeenCalledWith("loading");
  });

  it("renders RTL chrome regardless of selections", () => {
    const { container } = render(<HomeScreen onNavigate={vi.fn()} onStartAnalysis={vi.fn()} />);
    expect(container.firstChild).toHaveAttribute("dir", "rtl");
  });
});
