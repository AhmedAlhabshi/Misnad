import { describe, it, expect } from "vitest";
import { buildStyles, buildReportFileName } from "../generateReportPdf";
import type { ReportSummaryData } from "@/lib/reportSummary";

function baseData(overrides: Partial<ReportSummaryData> = {}): ReportSummaryData {
  return {
    language: "en",
    generatedAt: "2026-03-15T12:00:00.000Z",
    contract: { title: "Auto Finance — Toyota Camry 2024", typeLabel: "Auto Finance", overallRisk: "medium", duration: "48 months" },
    keyFinancialFigures: [{ key: "monthly_installment", label: "Monthly installment", value: "2,400.00 SAR" }],
    importantFindings: [{ title: "Late payment", summary: "A fee applies.", riskLevel: "high" }],
    conclusion: "This contract has 1 notable finding.",
    ...overrides,
  };
}

describe("generateReportPdf", () => {
  it("uses RTL direction and right text alignment for Arabic", () => {
    const styles = buildStyles(true);
    expect(styles.page.direction).toBe("rtl");
    expect(styles.headerTitle.textAlign).toBe("right");
  });

  it("uses LTR direction and left text alignment for English", () => {
    const styles = buildStyles(false);
    expect(styles.page.direction).toBe("ltr");
    expect(styles.headerTitle.textAlign).toBe("left");
  });

  it("builds a clear, English filename ending in .pdf for a contract-only report", () => {
    const fileName = buildReportFileName(baseData({ language: "en" }));
    expect(fileName.endsWith(".pdf")).toBe(true);
    expect(fileName).toContain("misnad-contract-summary");
    expect(fileName).not.toContain("personalized");
  });

  it("builds a clear, Arabic filename ending in .pdf for a contract-only report", () => {
    const fileName = buildReportFileName(baseData({ language: "ar" }));
    expect(fileName.endsWith(".pdf")).toBe(true);
    expect(fileName).toContain("خلاصة-تحليل-العقد");
  });

  it("includes a personalized-analysis marker in the filename when the report includes it", () => {
    const withPersonalized = baseData({
      personalized: {
        monthlyIncome: "10,000.00 SAR",
        existingMonthlyObligations: "500.00 SAR",
        newContractCommitment: "2,400.00 SAR",
        totalMonthlyObligations: "2,900.00 SAR",
        obligationToIncomeRatio: "29%",
        remainingMonthlyAmount: "4,100.00 SAR",
        conclusion: "This fits your budget.",
      },
    });
    const fileName = buildReportFileName(withPersonalized);
    expect(fileName).toContain("with-personalized-analysis");
  });

  it("produces different filenames for contract-only vs. personalized reports on the same day", () => {
    const contractOnly = buildReportFileName(baseData());
    const personalized = buildReportFileName(
      baseData({
        personalized: {
          monthlyIncome: "x",
          existingMonthlyObligations: "x",
          newContractCommitment: "x",
          totalMonthlyObligations: "x",
          obligationToIncomeRatio: "x",
          remainingMonthlyAmount: "x",
          conclusion: "x",
        },
      }),
    );
    expect(contractOnly).not.toBe(personalized);
  });
});
