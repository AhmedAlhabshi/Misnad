import type { AnalysisLanguage } from "@workspace/contract-types";

/**
 * Bilingual copy for the 4-tab results workspace: Overview (contract
 * understanding only — no financial dashboard), Contract Finances
 * (semantically-classified money), Financial Analysis (deterministic
 * budget math + AI-interpreted, grounded insights), Contract (a real PDF
 * viewer). Kept separate from `financialMetricsCopy.ts` (which supplies
 * the enum-label dictionaries and the canonical financial-concept
 * dictionary reused here).
 */
export interface TabLabel {
  /** Full label shown on desktop / wide screens. */
  full: string;
  /** Short label shown on narrow/mobile screens — same tab `value`, only the visible text changes. */
  short: string;
}

export interface ResultsCopy {
  back: string;
  noResult: string;
  reasonPrefix: string;
  /** Shown instead of the raw uploaded file name when it can't be safely displayed (e.g. corrupted encoding). */
  fileNameFallback: string;

  tabs: {
    overview: TabLabel;
    finances: TabLabel;
    financialAnalysis: TabLabel;
    contract: TabLabel;
    chat: TabLabel;
  };

  overview: {
    explanationTitle: string;
    simplifyAction: string;
    showOriginalAction: string;
    clausesTitle: string;
    clausesEmpty: string;
    whatItSaysLabel: string;
    simpleExplanationLabel: string;
    partiesTitle: string;
  };

  /**
   * Copy for the Contract Finances ("Your Money") tab — a structured
   * presentation of financial facts explicitly stated in the contract,
   * grouped by semantic meaning (never by contract type, never a
   * calculator). Each `*Title` is a group heading; a group is only ever
   * rendered when the contract actually has at least one fact for it.
   */
  finances: {
    emptyState: string;
    whatYoullPayTitle: string;
    feesAndCostsTitle: string;
    conditionalAmountsTitle: string;
    conditionalAmountsNotice: string;
    financingAndCreditTitle: string;
    ratesAndPercentagesTitle: string;
    durationsAndCountsTitle: string;
    otherStatedAmountsTitle: string;
    /** Prefix for a conditional amount that is a stated cap/maximum, e.g. "up to 500 SAR" / "حتى 500 ر.س." — never presented as a guaranteed exact amount. */
    upToPrefix: string;
    /** The stated contract duration's own label, e.g. "Contract duration — 48 months" / "مدة العقد — 48 شهر". Never reused for anything else — a duration is its own semantic fact, distinct from any monetary concept. */
    durationLabel: string;
    /** The stated installment/payment count's own label, e.g. "Number of installments — 48" / "عدد الأقساط — 48". Never borrowed from the payment's own concept label (e.g. "Monthly installment") — a count is its own semantic fact. */
    installmentCountLabel: string;
    durationUnitLabels: {
      days: string;
      months: string;
      years: string;
    };
  };

  financialAnalysis: {
    introTitle: string;
    introBody: string;
    form: {
      monthlyIncome: string;
      essentialExpenses: string;
      existingDebt: string;
      savings: string;
      savingsOptional: string;
      submit: string;
      incomplete: string;
    };
    editInputs: string;
    /**
     * Section 1 — the deterministic, code-calculated budget-impact
     * accordion. Never AI-generated. `contractIncomeRatioLabel` and
     * `totalCommitmentRatioLabel` are two DIFFERENT percentages (the new
     * contract's own monthly payment ÷ income, vs. every monthly
     * obligation including existing debt ÷ income) and must never share a
     * label or be described with the same generic wording anywhere.
     */
    budgetImpact: {
      title: string;
      remainingBeforeLabel: string;
      remainingAfterLabel: string;
      contractIncomeRatioLabel: string;
      totalCommitmentRatioLabel: string;
      savingsLabel: string;
    };
    /** Sections 2-4 — AI-interpreted, grounded insights rendered by PersonalizedAnalysisSection. */
    personalizedAnalysis: {
      personalImpactTitle: string;
      thingsToWatchTitle: string;
      beforeYouSignTitle: string;
      adviceLabel: string;
      questionLabel: string;
      loading: string;
      unavailable: string;
      retryAction: string;
    };
  };

  /**
   * Copy for the Contract tab — a real PDF viewer of the originally
   * uploaded document (current session only). `riskHigh`/`riskMedium`/
   * `riskLow` are reused by Overview's clause accordion severity badges.
   */
  contract: {
    riskHigh: string;
    riskMedium: string;
    riskLow: string;
    noDocumentTitle: string;
    noDocumentBody: string;
    highlightingNoteText: string;
    page: string;
    of: string;
    previousPage: string;
    nextPage: string;
  };

  /**
   * Copy for the "Ask Misnad" chat tab. Deliberately has no field for
   * showing `route`, `confidence`, or `provider`/`model` prominently — per
   * this feature's own requirement, those are either omitted or reduced to
   * the two user-friendly warning strings below (`evidencePartialWarning`/
   * `evidenceInsufficientWarning`), never a raw enum name.
   */
  chat: {
    disclaimer: string;
    inputPlaceholder: string;
    inputAriaLabel: string;
    send: string;
    charactersRemainingTemplate: (remaining: number) => string;
    overLimitMessage: string;
    sessionUnavailableNotice: string;
    loadingStages: string[];
    /** Shown in place of the last loading stage once the request has been pending long enough that the fixed stage sequence has fully run its course but the real answer still hasn't arrived — never implies a restart, never reveals provider/key/retry details. */
    extendedWaitMessage: string;
    suggestedTitle: string;
    contractCitationLabel: string;
    legalCitationLabel: string;
    viewOfficialSource: string;
    showExcerpt: string;
    hideExcerpt: string;
    evidencePartialWarning: string;
    evidenceInsufficientWarning: string;
    unavailableSourcesPrefix: string;
    unavailableSourceLabels: { contract: string; legal: string; financial: string };
    retryAction: string;
    emptyStateHint: string;
  };
}

const AR: ResultsCopy = {
  back: "الرئيسية",
  noResult: "لا توجد نتيجة تحليل متاحة حالياً.",
  reasonPrefix: "السبب",
  fileNameFallback: "العقد المرفوع",

  tabs: {
    overview: { full: "نظرة عامة", short: "نظرة عامة" },
    finances: { full: "أموالك في العقد", short: "أموالك" },
    financialAnalysis: { full: "التحليل المالي", short: "تحليلي" },
    contract: { full: "العقد", short: "العقد" },
    chat: { full: "اسأل مِسناد", short: "اسأل مِسناد" },
  },

  overview: {
    explanationTitle: "شرح عقدك",
    simplifyAction: "اشرح لي العقد بطريقة أبسط",
    showOriginalAction: "عرض الشرح الأصلي",
    clausesTitle: "بنود عقدك",
    clausesEmpty: "لم يتم استخراج بنود من هذا العقد.",
    whatItSaysLabel: "ماذا يقول العقد؟",
    simpleExplanationLabel: "الشرح المبسط",
    partiesTitle: "أطراف العقد",
  },

  finances: {
    emptyState: "لم يتم استخراج معلومات مالية من هذا العقد.",
    whatYoullPayTitle: "ما ستدفعه",
    feesAndCostsTitle: "الرسوم والتكاليف",
    conditionalAmountsTitle: "المبالغ المشروطة أو المحتملة",
    conditionalAmountsNotice: "هذه المبالغ مرتبطة بوقوع أحداث أو شروط معينة، وليست مبالغ مؤكدة الدفع.",
    financingAndCreditTitle: "مبالغ التمويل أو الائتمان",
    ratesAndPercentagesTitle: "النسب والمعدلات",
    durationsAndCountsTitle: "المدد وعدد الدفعات",
    otherStatedAmountsTitle: "مبالغ أخرى مذكورة في العقد",
    upToPrefix: "حتى",
    durationLabel: "مدة العقد",
    installmentCountLabel: "عدد الأقساط",
    durationUnitLabels: {
      days: "يوم",
      months: "شهر",
      years: "سنة",
    },
  },

  financialAnalysis: {
    introTitle: "كيف سيؤثر هذا العقد على ميزانيتك؟",
    introBody: "أدخل معلومات مالية بسيطة لنقارن التزامات العقد بوضعك المالي.",
    form: {
      monthlyIncome: "الدخل الشهري",
      essentialExpenses: "المصاريف الشهرية الأساسية",
      existingDebt: "الأقساط أو الديون الشهرية الحالية",
      savings: "المدخرات المتاحة",
      savingsOptional: "اختياري",
      submit: "حلّل أثر العقد عليّ",
      incomplete: "أدخل الدخل الشهري والمصاريف الأساسية والديون الحالية لإجراء التحليل.",
    },
    editInputs: "تعديل البيانات",
    budgetImpact: {
      title: "أثر العقد على ميزانيتك",
      remainingBeforeLabel: "المتبقي شهرياً قبل العقد",
      remainingAfterLabel: "المتبقي شهرياً بعد العقد",
      contractIncomeRatioLabel: "نسبة التزام العقد الجديد من الدخل",
      totalCommitmentRatioLabel: "نسبة إجمالي الالتزامات الشهرية بعد العقد من الدخل",
      savingsLabel: "المدخرات: قبل → بعد دفعات البداية",
    },
    personalizedAnalysis: {
      personalImpactTitle: "كيف يؤثر العقد عليك؟",
      thingsToWatchTitle: "أشياء انتبه لها",
      beforeYouSignTitle: "قبل أن توقّع",
      adviceLabel: "نصيحة",
      questionLabel: "سؤال",
      loading: "جارٍ إعداد التحليل الشخصي...",
      unavailable: "تعذّر إعداد التحليل الشخصي حالياً. تبقى الأرقام أعلاه متاحة وصحيحة.",
      retryAction: "إعادة المحاولة",
    },
  },

  contract: {
    riskHigh: "مرتفع",
    riskMedium: "متوسط",
    riskLow: "منخفض",
    noDocumentTitle: "المستند غير متاح",
    noDocumentBody: "لا يمكن عرض العقد الأصلي لهذه النتيجة في الجلسة الحالية.",
    highlightingNoteText: "تمييز البنود تلقائياً غير متاح حالياً لهذا العقد.",
    page: "صفحة",
    of: "من",
    previousPage: "الصفحة السابقة",
    nextPage: "الصفحة التالية",
  },

  chat: {
    disclaimer: "الإجابات مبنية على عقدك الذي تم تحليله والمصادر النظامية الرسمية فقط.",
    inputPlaceholder: "اسأل عن عقدك، تكاليفه، أو الأنظمة المتعلقة به...",
    inputAriaLabel: "اكتب سؤالك",
    send: "إرسال",
    charactersRemainingTemplate: (remaining) => `${remaining} حرفاً متبقياً`,
    overLimitMessage: "السؤال طويل جداً. يرجى اختصاره.",
    sessionUnavailableNotice: "الأسئلة المتعلقة بتفاصيل عقدك تحديداً غير متاحة مؤقتاً لهذه الجلسة. الأسئلة العامة والمتعلقة بالأنظمة قد تظل تعمل.",
    loadingStages: ["البحث داخل العقد", "مراجعة المصادر النظامية", "تجهيز الإجابة", "صياغة الرد النهائي"],
    extendedWaitMessage: "جاري إنهاء الإجابة...",
    suggestedTitle: "أسئلة مقترحة",
    contractCitationLabel: "من عقدك",
    legalCitationLabel: "مرجع نظامي رسمي",
    viewOfficialSource: "عرض المصدر الرسمي",
    showExcerpt: "عرض النص",
    hideExcerpt: "إخفاء النص",
    evidencePartialWarning: "هذه الإجابة مبنية على جزء فقط من الأدلة المتاحة، وقد لا تكون كاملة.",
    evidenceInsufficientWarning: "لا تتوفر أدلة كافية للإجابة على هذا السؤال بثقة. الإجابة أدناه للاسترشاد فقط وليست تأكيداً نظامياً.",
    unavailableSourcesPrefix: "تعذّر الوصول إلى بعض المصادر لهذا السؤال:",
    unavailableSourceLabels: { contract: "عقدك", legal: "المراجع النظامية", financial: "البيانات المالية" },
    retryAction: "إعادة المحاولة",
    emptyStateHint: "اطرح سؤالك أو اختر أحد الأسئلة المقترحة أدناه.",
  },
};

const EN: ResultsCopy = {
  back: "Home",
  noResult: "No analysis result is currently available.",
  reasonPrefix: "Reason",
  fileNameFallback: "Uploaded contract",

  tabs: {
    overview: { full: "Overview", short: "Overview" },
    finances: { full: "Contract Finances", short: "Finances" },
    financialAnalysis: { full: "Financial Analysis", short: "My Analysis" },
    contract: { full: "Contract", short: "Contract" },
    chat: { full: "Ask Misnad", short: "Ask Misnad" },
  },

  overview: {
    explanationTitle: "Understanding your contract",
    simplifyAction: "Explain this contract more simply",
    showOriginalAction: "Show the original explanation",
    clausesTitle: "Your contract clauses",
    clausesEmpty: "No clauses were extracted from this contract.",
    whatItSaysLabel: "What does the contract say?",
    simpleExplanationLabel: "Simple explanation",
    partiesTitle: "Contract parties",
  },

  finances: {
    emptyState: "No financial information was extracted from this contract.",
    whatYoullPayTitle: "What you'll pay",
    feesAndCostsTitle: "Fees and costs",
    conditionalAmountsTitle: "Conditional or potential amounts",
    conditionalAmountsNotice: "These amounts depend on specific events or conditions — they are not confirmed payments.",
    financingAndCreditTitle: "Financing or credit amounts",
    ratesAndPercentagesTitle: "Rates and percentages",
    durationsAndCountsTitle: "Durations and payment counts",
    otherStatedAmountsTitle: "Other amounts stated in the contract",
    upToPrefix: "up to",
    durationLabel: "Contract duration",
    installmentCountLabel: "Number of installments",
    durationUnitLabels: {
      days: "day(s)",
      months: "month(s)",
      years: "year(s)",
    },
  },

  financialAnalysis: {
    introTitle: "How will this contract affect your budget?",
    introBody: "Enter some simple financial information so we can compare the contract's obligations with your financial situation.",
    form: {
      monthlyIncome: "Monthly income",
      essentialExpenses: "Essential monthly expenses",
      existingDebt: "Existing monthly debt / installments",
      savings: "Available savings",
      savingsOptional: "Optional",
      submit: "Analyze the contract's impact on me",
      incomplete: "Enter your monthly income, essential expenses, and existing debt to run the analysis.",
    },
    editInputs: "Edit inputs",
    budgetImpact: {
      title: "Impact on your budget",
      remainingBeforeLabel: "Remaining monthly before the contract",
      remainingAfterLabel: "Remaining monthly after the contract",
      contractIncomeRatioLabel: "New contract monthly payment as a percentage of income",
      totalCommitmentRatioLabel: "Total monthly obligations after contract as a percentage of income",
      savingsLabel: "Savings: before → after start payments",
    },
    personalizedAnalysis: {
      personalImpactTitle: "How does the contract affect you?",
      thingsToWatchTitle: "Things to watch",
      beforeYouSignTitle: "Before you sign",
      adviceLabel: "Advice",
      questionLabel: "Question",
      loading: "Preparing your personalized analysis...",
      unavailable: "Personalized analysis isn't available right now. The numbers above remain accurate and available.",
      retryAction: "Retry",
    },
  },

  contract: {
    riskHigh: "High",
    riskMedium: "Medium",
    riskLow: "Low",
    noDocumentTitle: "Document unavailable",
    noDocumentBody: "The original contract for this result can't be displayed in the current session.",
    highlightingNoteText: "Automatic clause highlighting isn't available yet for this contract.",
    page: "Page",
    of: "of",
    previousPage: "Previous page",
    nextPage: "Next page",
  },

  chat: {
    disclaimer: "Answers are based only on your analyzed contract and official Saudi legal sources.",
    inputPlaceholder: "Ask about your contract, its costs, or applicable regulations...",
    inputAriaLabel: "Type your question",
    send: "Send",
    charactersRemainingTemplate: (remaining) => `${remaining} characters remaining`,
    overLimitMessage: "Your question is too long. Please shorten it.",
    sessionUnavailableNotice:
      "Questions specific to your contract's details aren't available for this session right now. General and regulation-related questions may still work.",
    loadingStages: ["Searching the contract", "Reviewing legal sources", "Preparing the answer", "Finalizing the response"],
    extendedWaitMessage: "Finalizing the answer...",
    suggestedTitle: "Suggested questions",
    contractCitationLabel: "From your contract",
    legalCitationLabel: "Official legal reference",
    viewOfficialSource: "View official source",
    showExcerpt: "Show text",
    hideExcerpt: "Hide text",
    evidencePartialWarning: "This answer is based on only part of the available evidence and may be incomplete.",
    evidenceInsufficientWarning: "There isn't enough evidence to answer this confidently. The answer below is for guidance only, not a legal determination.",
    unavailableSourcesPrefix: "Some sources couldn't be reached for this question:",
    unavailableSourceLabels: { contract: "your contract", legal: "legal references", financial: "financial data" },
    retryAction: "Retry",
    emptyStateHint: "Ask your question or pick one of the suggested questions below.",
  },
};

export const RESULTS_COPY: Record<AnalysisLanguage, ResultsCopy> = { ar: AR, en: EN };
