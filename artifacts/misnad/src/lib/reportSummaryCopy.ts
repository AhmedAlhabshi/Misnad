import type { AnalysisLanguage } from "@workspace/contract-types";

export interface ReportSummaryCopy {
  /** The button shown in the results header. */
  downloadButton: string;

  dialog: {
    title: string;
    optionATitle: string;
    optionADescription: string;
    optionBTitle: string;
    optionBDescription: string;
    /** Shown under Option B when personalized analysis hasn't been completed yet. */
    optionBUnavailableMessage: string;
    /** Navigates to the Personalized Analysis tab and closes the dialog. */
    goToPersonalizedAnalysis: string;
    cancel: string;
    generate: string;
    generating: string;
  };

  pdf: {
    headerTitle: string;
    generatedOnLabel: string;
    keyFiguresTitle: string;
    findingsTitle: string;
    findingsEmpty: string;
    conclusionTitle: string;
    personalizedTitle: string;
    personalized: {
      monthlyIncome: string;
      existingMonthlyObligations: string;
      newContractCommitment: string;
      totalMonthlyObligations: string;
      obligationToIncomeRatio: string;
      remainingMonthlyAmount: string;
      conclusionLabel: string;
    };
    riskLabels: { high: string; medium: string; low: string };
    unavailable: string;
    footerDisclaimer: string;
    pageLabel: (page: number, totalPages: number) => string;
    /** Deterministic, template-based executive conclusion — never LLM-generated. */
    contractOnlyConclusion: (totalFindings: number, highRiskCount: number) => string;
    /** Shown only if the completed personalized analysis has no usable insight text (an edge case) — never a fabricated statement. */
    personalizedConclusionFallback: string;
  };
}

const AR: ReportSummaryCopy = {
  downloadButton: "تحميل خلاصة التقرير",
  dialog: {
    title: "تحميل خلاصة التقرير",
    optionATitle: "خلاصة العقد فقط",
    optionADescription: "نوع العقد، أهم الأرقام المالية، وأبرز البنود.",
    optionBTitle: "الخلاصة + التحليل المالي الشخصي",
    optionBDescription: "كل ما في الخيار الأول، بالإضافة إلى تحليلك المالي الشخصي المكتمل.",
    optionBUnavailableMessage: "أكمل التحليل المالي الشخصي أولًا لإضافته إلى الخلاصة.",
    goToPersonalizedAnalysis: "الانتقال إلى التحليل المالي الشخصي",
    cancel: "إلغاء",
    generate: "تنزيل الملف",
    generating: "جارٍ إعداد الملف…",
  },
  pdf: {
    headerTitle: "خلاصة تحليل العقد",
    generatedOnLabel: "تاريخ الإنشاء",
    keyFiguresTitle: "أهم الأرقام المالية",
    findingsTitle: "أبرز البنود",
    findingsEmpty: "لا توجد بنود بارزة لعرضها.",
    conclusionTitle: "الخلاصة",
    personalizedTitle: "التحليل المالي الشخصي",
    personalized: {
      monthlyIncome: "الدخل الشهري",
      existingMonthlyObligations: "الالتزامات الشهرية الحالية",
      newContractCommitment: "التزام العقد الجديد",
      totalMonthlyObligations: "إجمالي الالتزامات الشهرية بعد العقد",
      obligationToIncomeRatio: "نسبة الالتزامات إلى الدخل",
      remainingMonthlyAmount: "المتبقي من الدخل الشهري",
      conclusionLabel: "خلاصة التحليل الشخصي",
    },
    riskLabels: { high: "مرتفعة", medium: "متوسطة", low: "منخفضة" },
    unavailable: "غير متاح",
    footerDisclaimer: "تم إنشاء هذه الخلاصة بواسطة مِسناد. لا تغني عن الاستشارة القانونية أو المالية المتخصصة.",
    pageLabel: (page, totalPages) => `صفحة ${page} من ${totalPages}`,
    contractOnlyConclusion: (totalFindings, highRiskCount) => {
      if (totalFindings === 0) {
        return "لم يتم تحديد بنود بارزة في هذا العقد. يُنصح بمراجعة العقد كاملاً والتشاور مع مختص قبل اتخاذ قرار نهائي.";
      }
      if (highRiskCount > 0) {
        return `يحتوي هذا العقد على عدد ${totalFindings} من البنود البارزة، من ضمنها عدد ${highRiskCount} من البنود عالية المخاطر. يُنصح بمراجعة هذه البنود بعناية والتشاور مع مختص قبل اتخاذ قرار نهائي.`;
      }
      return `يحتوي هذا العقد على عدد ${totalFindings} من البنود البارزة. يُنصح بمراجعة النتائج التفصيلية والتشاور مع مختص قبل اتخاذ قرار نهائي.`;
    },
    personalizedConclusionFallback: "لم يتم تحديد أثر شخصي واضح في التحليل المكتمل. راجع تفاصيل التحليل الشخصي الكاملة في التطبيق.",
  },
};

const EN: ReportSummaryCopy = {
  downloadButton: "Download Report Summary",
  dialog: {
    title: "Download Report Summary",
    optionATitle: "Contract summary only",
    optionADescription: "Contract type, key financial figures, and top findings.",
    optionBTitle: "Summary + personalized financial analysis",
    optionBDescription: "Everything in Option A, plus your completed personalized financial analysis.",
    optionBUnavailableMessage: "Complete the personalized financial analysis first to include it in the summary.",
    goToPersonalizedAnalysis: "Go to Personalized Analysis",
    cancel: "Cancel",
    generate: "Download file",
    generating: "Preparing your file…",
  },
  pdf: {
    headerTitle: "Contract Analysis Summary",
    generatedOnLabel: "Generated on",
    keyFiguresTitle: "Key Financial Figures",
    findingsTitle: "Top Findings",
    findingsEmpty: "No notable findings to show.",
    conclusionTitle: "Conclusion",
    personalizedTitle: "Personalized Financial Analysis",
    personalized: {
      monthlyIncome: "Monthly income",
      existingMonthlyObligations: "Existing monthly obligations",
      newContractCommitment: "New contract commitment",
      totalMonthlyObligations: "Total monthly obligations after the contract",
      obligationToIncomeRatio: "Obligation-to-income ratio",
      remainingMonthlyAmount: "Remaining monthly amount",
      conclusionLabel: "Personalized analysis conclusion",
    },
    riskLabels: { high: "High", medium: "Medium", low: "Low" },
    unavailable: "Unavailable",
    footerDisclaimer: "This summary was generated by Misnad and does not replace professional legal or financial advice.",
    pageLabel: (page, totalPages) => `Page ${page} of ${totalPages}`,
    contractOnlyConclusion: (totalFindings, highRiskCount) => {
      if (totalFindings === 0) {
        return "No notable clauses were identified in this contract. Review the full contract and consult a professional before making a final decision.";
      }
      if (highRiskCount > 0) {
        const findingsWord = totalFindings === 1 ? "finding" : "findings";
        const riskWord = highRiskCount === 1 ? "clause" : "clauses";
        return `This contract has ${totalFindings} notable ${findingsWord}, including ${highRiskCount} high-risk ${riskWord}. Review these carefully and consult a professional before making a final decision.`;
      }
      const findingsWord = totalFindings === 1 ? "finding" : "findings";
      return `This contract has ${totalFindings} notable ${findingsWord}. Review the detailed results and consult a professional before making a final decision.`;
    },
    personalizedConclusionFallback: "No clear personal impact was identified in the completed analysis. Review the full personalized analysis in the app.",
  },
};

export const REPORT_SUMMARY_COPY: Record<AnalysisLanguage, ReportSummaryCopy> = { ar: AR, en: EN };
