import type { AnalysisLanguage } from "@workspace/contract-types";

/**
 * Small, additive AR/EN dictionary for the handful of V2-only section
 * labels the new results IA introduces (Contract Overview stat labels,
 * Executive Summary, the renamed tab titles). Everything else reuses
 * `RESULTS_COPY`/`FINANCIAL_METRICS_COPY` from `@/lib/*` unchanged.
 */
export interface V2Copy {
  tabs: {
    overview: { full: string; short: string };
    executiveSummary: { full: string; short: string };
    financialObligations: { full: string; short: string };
    clauses: { full: string; short: string };
    insights: { full: string; short: string };
    chat: { full: string; short: string };
    document: { full: string; short: string };
  };
  overview: {
    riskLabel: string;
    durationLabel: string;
    monthlyCommitmentLabel: string;
    totalCostLabel: string;
  };
  executiveSummary: {
    title: string;
    empty: string;
    riskClauseBadge: string;
    conditionalCostBadge: string;
    missingInfoBadge: string;
  };
  clauses: { title: string };
  financialObligations: { title: string };
  insights: { title: string };
  back: string;
}

const AR: V2Copy = {
  tabs: {
    overview: { full: "نظرة عامة", short: "نظرة عامة" },
    executiveSummary: { full: "أهم النقاط", short: "أهم النقاط" },
    financialObligations: { full: "الالتزامات المالية", short: "الالتزامات" },
    clauses: { full: "بنود العقد", short: "البنود" },
    insights: { full: "التحليل الشخصي", short: "تحليلي" },
    chat: { full: "اسأل مِسناد", short: "اسأل مِسناد" },
    document: { full: "المستند الأصلي", short: "المستند" },
  },
  overview: {
    riskLabel: "المخاطر الإجمالية",
    durationLabel: "مدة العقد",
    monthlyCommitmentLabel: "الالتزام الشهري",
    totalCostLabel: "التكلفة الإجمالية المعروفة",
  },
  executiveSummary: {
    title: "أهم النقاط في هذا العقد",
    empty: "لم يتم رصد نقاط بارزة تستدعي الانتباه في هذا العقد.",
    riskClauseBadge: "بند مهم",
    conditionalCostBadge: "تكلفة محتملة",
    missingInfoBadge: "معلومة ناقصة",
  },
  clauses: { title: "بنود العقد" },
  financialObligations: { title: "الالتزامات المالية" },
  insights: { title: "التحليل المالي الشخصي" },
  back: "الرئيسية",
};

const EN: V2Copy = {
  tabs: {
    overview: { full: "Overview", short: "Overview" },
    executiveSummary: { full: "Key Findings", short: "Findings" },
    financialObligations: { full: "Financial Obligations", short: "Obligations" },
    clauses: { full: "Contract Clauses", short: "Clauses" },
    insights: { full: "Personalized Insights", short: "Insights" },
    chat: { full: "Ask Misnad", short: "Ask Misnad" },
    document: { full: "Original Document", short: "Document" },
  },
  overview: {
    riskLabel: "Overall risk",
    durationLabel: "Contract duration",
    monthlyCommitmentLabel: "Monthly commitment",
    totalCostLabel: "Total known cost",
  },
  executiveSummary: {
    title: "Key findings in this contract",
    empty: "No standout findings were identified for this contract.",
    riskClauseBadge: "Important clause",
    conditionalCostBadge: "Potential cost",
    missingInfoBadge: "Missing information",
  },
  clauses: { title: "Contract clauses" },
  financialObligations: { title: "Financial obligations" },
  insights: { title: "Personalized financial analysis" },
  back: "Home",
};

export const V2_COPY: Record<AnalysisLanguage, V2Copy> = { ar: AR, en: EN };
