import type { AnalysisLanguage } from "@workspace/contract-types";
import type { FeeType, ObligationType, PaymentFrequency, PenaltyType } from "@workspace/financial-metrics";

export interface FinancialMetricsCopy {
  title: string;
  /** Shown under the title only when at least one headline summary metric is unavailable. */
  partial: string;
  /** Small label for a `status: "estimated"` metric — the figure was derived/calculated, not a stated fact. */
  calculated: string;
  unavailable: string;
  currencyUnknown: string;
  reasonPrefix: string;
  noDataState: string;

  summary: {
    title: string;
    monthlyCommitment: string;
    annualCommitment: string;
    duration: string;
    coreObligations: string;
    knownCost: string;
    upfrontExposure: string;
    /** The amount that repays the financed principal (recurring installments + any balloon), excluding pre-financing amounts like a down payment — see `financingRepaymentTotal`. */
    financingRepaymentTotal: string;
    /** `financingRepaymentTotal - calculatedBaseCost` — what financing itself costs, in the same currency. */
    financingCost: string;
  };

  duration: {
    title: string;
    days: string;
    weeks: string;
    months: string;
    years: string;
    paymentCount: string;
  };

  paymentObligations: {
    title: string;
    empty: string;
    mandatory: string;
    conditional: string;
    unresolved: string;
  };

  fees: {
    title: string;
    empty: string;
    mandatory: string;
    recurring: string;
    oneTime: string;
    conditional: string;
    refundable: string;
    refundabilityUnresolved: string;
    totalKnown: string;
  };

  penalties: {
    title: string;
    empty: string;
    conditionalNotice: string;
    totalKnown: string;
    highest: string;
  };

  exposure: {
    title: string;
    upfront: string;
    contingent: string;
    monthly: string;
    annual: string;
    maximumSinglePayment: string;
    totalsByCurrency: string;
    unquantifiedContingent: string;
  };

  ratios: {
    title: string;
    feesToBaseCost: string;
    penaltiesToBaseCost: string;
    upfrontPaymentToBaseCost: string;
    balloonPaymentToBaseCost: string;
    totalCostIncrease: string;
    recurringPaymentToIncome: string;
  };

  calculationDetails: {
    title: string;
    warnings: string;
    conflicts: string;
    unavailableCalculations: string;
    excludedValues: string;
  };

  calculationFailed: string;
  calculationFailedHint: string;

  obligationTypeLabels: Record<ObligationType, string>;
  feeTypeLabels: Record<FeeType, string>;
  penaltyTypeLabels: Record<PenaltyType, string>;
  frequencyLabels: Record<PaymentFrequency, string>;
}

const AR: FinancialMetricsCopy = {
  title: "المؤشرات المالية",
  partial: "بيانات جزئية متاحة",
  calculated: "مُحتسب",
  unavailable: "غير متاح",
  currencyUnknown: "العملة غير محددة",
  reasonPrefix: "السبب",
  noDataState: "المؤشرات المالية غير متاحة لهذا العقد.",

  summary: {
    title: "الملخص المالي",
    monthlyCommitment: "الالتزام الشهري",
    annualCommitment: "الالتزام السنوي",
    duration: "مدة العقد",
    coreObligations: "الالتزامات الأساسية المؤكدة",
    knownCost: "التكلفة المعروفة",
    upfrontExposure: "المبالغ المستحقة مقدماً",
    financingRepaymentTotal: "إجمالي سداد التمويل",
    financingCost: "تكلفة التمويل",
  },

  duration: {
    title: "مدة العقد",
    days: "يوم",
    weeks: "أسبوع",
    months: "شهر",
    years: "سنة",
    paymentCount: "عدد الدفعات",
  },

  paymentObligations: {
    title: "الالتزامات المالية",
    empty: "لم يتم تحديد التزامات مالية محددة.",
    mandatory: "إلزامي",
    conditional: "مشروط",
    unresolved: "غير محدد",
  },

  fees: {
    title: "الرسوم",
    empty: "لم يتم تحديد رسوم محددة.",
    mandatory: "إلزامية",
    recurring: "متكررة",
    oneTime: "لمرة واحدة",
    conditional: "مشروطة",
    refundable: "قابلة للاسترداد",
    refundabilityUnresolved: "قابلية الاسترداد غير محددة",
    totalKnown: "إجمالي الرسوم المعروفة",
  },

  penalties: {
    title: "الغرامات",
    empty: "لم يتم تحديد غرامات محددة.",
    conditionalNotice:
      "هذه المبالغ مرتبطة بوقوع أحداث أو شروط محددة، ولا تدخل بالضرورة ضمن التكلفة الأساسية للعقد.",
    totalKnown: "إجمالي الغرامات المعروفة",
    highest: "أعلى غرامة معروفة",
  },

  exposure: {
    title: "التعرض المالي",
    upfront: "مستحق مقدماً",
    contingent: "مشروط بأحداث معينة",
    monthly: "شهري",
    annual: "سنوي",
    maximumSinglePayment: "أعلى دفعة منفردة معروفة",
    totalsByCurrency: "الإجماليات حسب العملة",
    unquantifiedContingent: "توجد مبالغ مشروطة غير قابلة للتحديد رقمياً",
  },

  ratios: {
    title: "النسب المالية",
    feesToBaseCost: "نسبة الرسوم إلى المبلغ الأساسي",
    penaltiesToBaseCost: "نسبة الغرامات إلى المبلغ الأساسي",
    upfrontPaymentToBaseCost: "نسبة الدفعة المقدمة إلى مبلغ التمويل",
    balloonPaymentToBaseCost: "نسبة الدفعة الختامية إلى المبلغ الأساسي",
    totalCostIncrease: "نسبة زيادة التكلفة الإجمالية",
    recurringPaymentToIncome: "نسبة الالتزام الشهري إلى الدخل",
  },

  calculationDetails: {
    title: "تفاصيل الحساب",
    warnings: "تنبيهات",
    conflicts: "تعارضات في البيانات",
    unavailableCalculations: "حسابات غير متاحة",
    excludedValues: "قيم مستبعدة من الحساب",
  },

  calculationFailed: "تعذر حساب المؤشرات المالية لهذا العقد.",
  calculationFailedHint: "يمكنك الاستمرار في مراجعة تحليل العقد أعلاه.",

  obligationTypeLabels: {
    principal: "أصل المبلغ الممول",
    recurring_payment: "دفعة متكررة",
    one_time_payment: "دفعة لمرة واحدة",
    upfront_payment: "دفعة مقدمة",
    deposit: "مبلغ تأمين",
    insurance: "تأمين",
    tax: "ضريبة",
    balloon_payment: "دفعة ختامية",
    conditional_payment: "دفعة مشروطة",
    unknown: "غير مصنف",
  },
  feeTypeLabels: {
    administration: "رسوم إدارية",
    processing: "رسوم معالجة",
    subscription: "رسوم اشتراك",
    insurance: "رسوم تأمين",
    maintenance: "رسوم صيانة",
    transfer: "رسوم تحويل",
    registration: "رسوم تسجيل",
    service: "رسوم خدمة",
    renewal: "رسوم تجديد",
    tax: "ضريبة",
    other: "رسوم أخرى",
  },
  penaltyTypeLabels: {
    late_payment: "غرامة تأخير سداد",
    early_termination: "غرامة إنهاء مبكر",
    early_settlement: "غرامة سداد مبكر",
    default: "غرامة إخلال بالعقد",
    cancellation: "غرامة إلغاء",
    returned_payment: "غرامة دفعة مرتجعة",
    other: "غرامة أخرى",
  },
  frequencyLabels: {
    one_time: "لمرة واحدة",
    daily: "يومي",
    weekly: "أسبوعي",
    monthly: "شهري",
    quarterly: "ربع سنوي",
    semi_annual: "نصف سنوي",
    annual: "سنوي",
    irregular: "غير منتظم",
    unknown: "غير محدد",
  },
};

const EN: FinancialMetricsCopy = {
  title: "Financial Metrics",
  partial: "Partial data available",
  calculated: "Calculated",
  unavailable: "Unavailable",
  currencyUnknown: "Currency not specified",
  reasonPrefix: "Reason",
  noDataState: "Financial metrics are unavailable for this contract.",

  summary: {
    title: "Financial summary",
    monthlyCommitment: "Monthly commitment",
    annualCommitment: "Annual commitment",
    duration: "Contract duration",
    coreObligations: "Core confirmed obligations",
    knownCost: "Known cost",
    upfrontExposure: "Upfront exposure",
    financingRepaymentTotal: "Total financing repayment",
    financingCost: "Financing cost",
  },

  duration: {
    title: "Contract duration",
    days: "day(s)",
    weeks: "week(s)",
    months: "month(s)",
    years: "year(s)",
    paymentCount: "Number of payments",
  },

  paymentObligations: {
    title: "Payment obligations",
    empty: "No specific payment obligations were identified.",
    mandatory: "Mandatory",
    conditional: "Conditional",
    unresolved: "Unresolved",
  },

  fees: {
    title: "Fees",
    empty: "No specific fees were identified.",
    mandatory: "Mandatory",
    recurring: "Recurring",
    oneTime: "One-time",
    conditional: "Conditional",
    refundable: "Refundable",
    refundabilityUnresolved: "Refundability unresolved",
    totalKnown: "Total known fees",
  },

  penalties: {
    title: "Penalties",
    empty: "No specific penalties were identified.",
    conditionalNotice:
      "These amounts depend on specific events or conditions and are not necessarily included in the contract’s normal cost.",
    totalKnown: "Total known penalties",
    highest: "Highest known penalty",
  },

  exposure: {
    title: "Financial exposure",
    upfront: "Upfront",
    contingent: "Contingent (event-based)",
    monthly: "Monthly",
    annual: "Annual",
    maximumSinglePayment: "Highest known single payment",
    totalsByCurrency: "Totals by currency",
    unquantifiedContingent: "There are contingent amounts that could not be quantified",
  },

  ratios: {
    title: "Financial ratios",
    feesToBaseCost: "Fees to base cost",
    penaltiesToBaseCost: "Penalties to base cost",
    upfrontPaymentToBaseCost: "Upfront payment to base cost",
    balloonPaymentToBaseCost: "Balloon payment to base cost",
    totalCostIncrease: "Total cost increase",
    recurringPaymentToIncome: "Recurring payment to income",
  },

  calculationDetails: {
    title: "Calculation details",
    warnings: "Warnings",
    conflicts: "Data conflicts",
    unavailableCalculations: "Unavailable calculations",
    excludedValues: "Values excluded from calculation",
  },

  calculationFailed: "Financial metrics could not be calculated for this contract.",
  calculationFailedHint: "You can still review the contract analysis above.",

  obligationTypeLabels: {
    principal: "Principal / financed amount",
    recurring_payment: "Recurring payment",
    one_time_payment: "One-time payment",
    upfront_payment: "Upfront payment",
    deposit: "Deposit",
    insurance: "Insurance",
    tax: "Tax",
    balloon_payment: "Balloon payment",
    conditional_payment: "Conditional payment",
    unknown: "Unclassified",
  },
  feeTypeLabels: {
    administration: "Administration fee",
    processing: "Processing fee",
    subscription: "Subscription fee",
    insurance: "Insurance fee",
    maintenance: "Maintenance fee",
    transfer: "Transfer fee",
    registration: "Registration fee",
    service: "Service fee",
    renewal: "Renewal fee",
    tax: "Tax",
    other: "Other fee",
  },
  penaltyTypeLabels: {
    late_payment: "Late payment penalty",
    early_termination: "Early termination penalty",
    early_settlement: "Early settlement penalty",
    default: "Default penalty",
    cancellation: "Cancellation penalty",
    returned_payment: "Returned payment penalty",
    other: "Other penalty",
  },
  frequencyLabels: {
    one_time: "One-time",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    quarterly: "Quarterly",
    semi_annual: "Semi-annual",
    annual: "Annual",
    irregular: "Irregular",
    unknown: "Unspecified",
  },
};

export const FINANCIAL_METRICS_COPY: Record<AnalysisLanguage, FinancialMetricsCopy> = { ar: AR, en: EN };

/**
 * The financial-metrics engine hard-codes a small, fixed set of English
 * labels for `typeDetails`-derived payment obligations (see
 * `lib/financial-metrics/src/pipeline/candidates.ts`'s `fromTypeDetailsAmount`
 * calls, e.g. "Down payment", "Monthly installment") — these never come from
 * the contract's own text, so the engine never localizes them. Everything
 * else on a `PaymentObligation.label` (e.g. a `financialObligations[]`
 * description) is genuine AI-generated or contract text already produced in
 * the requested analysis language, and must never be rewritten here.
 */
const KNOWN_ENGINE_OBLIGATION_LABELS: Record<string, string> = {
  "Down payment": "الدفعة المقدمة",
  "Monthly installment": "القسط الشهري",
};

/** Localizes a `PaymentObligation.label` for Arabic output — a no-op for English, and a no-op for any label the engine didn't hard-code itself (see `KNOWN_ENGINE_OBLIGATION_LABELS`). */
export function localizeObligationLabel(label: string, language: AnalysisLanguage): string {
  if (language !== "ar") {
    return label;
  }
  return KNOWN_ENGINE_OBLIGATION_LABELS[label] ?? label;
}
