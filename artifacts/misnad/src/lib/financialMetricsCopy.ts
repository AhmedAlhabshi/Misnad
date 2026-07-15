import type { AnalysisLanguage } from "@workspace/contract-types";
import type { FeeType, ObligationType, PaymentFrequency, PenaltyType } from "@workspace/financial-metrics";
import type { CanonicalConceptId } from "./financialConcepts";

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
 * Centralized labels for every canonical financial concept (see
 * `financialConcepts.ts`'s `CanonicalConceptId`) — generic across all
 * contract types, and exhaustive over the closed concept enum, so no
 * concept can ever fall through to a raw, untranslated engine label (the
 * previous "Balloon payment" leaking untranslated into Arabic results was
 * exactly this: a one-off 2-entry dictionary that only covered
 * "Down payment"/"Monthly installment"). Callers should still fall back to
 * the item's own sanitized, AI-generated label for the generic `"other"`
 * concept when a more specific real-world label is available and useful.
 */
const CANONICAL_CONCEPT_LABELS: Record<AnalysisLanguage, Record<CanonicalConceptId, string>> = {
  ar: {
    monthly_installment: "القسط الشهري",
    monthly_rent: "الإيجار الشهري",
    annual_rent: "الإيجار السنوي",
    salary: "الراتب",
    allowance: "البدل",
    bonus: "المكافأة",
    deduction: "الاستقطاع",
    insurance_premium: "قسط التأمين",
    deductible: "مبلغ التحمل",
    coverage_limit: "حد التغطية التأمينية",
    security_deposit: "مبلغ التأمين (الوديعة)",
    brokerage_fee: "رسوم الوساطة",
    administrative_fee: "الرسوم الإدارية",
    annual_fee: "الرسوم السنوية",
    subscription_fee: "رسوم الاشتراك",
    down_payment: "الدفعة المقدمة",
    final_payment: "الدفعة الختامية",
    financing_principal: "مبلغ التمويل",
    asset_value: "قيمة الأصل",
    total_repayment: "إجمالي السداد",
    financing_cost: "تكلفة التمويل",
    credit_limit: "الحد الائتماني",
    minimum_payment: "الحد الأدنى للسداد",
    late_fee: "رسوم التأخير",
    early_termination_fee: "رسوم الإنهاء المبكر",
    collection_cost: "تكلفة التحصيل",
    maintenance_cost: "تكلفة الصيانة",
    renewal_cost: "تكلفة التجديد",
    refund: "المبلغ المسترد",
    tax: "الضريبة",
    processing_fee: "رسوم المعالجة",
    transfer_fee: "رسوم التحويل",
    registration_fee: "رسوم التسجيل",
    service_fee: "رسوم الخدمة",
    early_settlement_fee: "رسوم السداد المبكر",
    cancellation_fee: "رسوم الإلغاء",
    returned_payment_fee: "رسوم الدفعة المرتجعة",
    recurring_payment: "دفعة متكررة",
    one_time_payment: "دفعة لمرة واحدة",
    conditional_payment: "دفعة مشروطة",
    interest_rate: "معدل الفائدة (APR)",
    outstanding_balance: "الرصيد المتبقي",
    other: "أخرى",
  },
  en: {
    monthly_installment: "Monthly installment",
    monthly_rent: "Monthly rent",
    annual_rent: "Annual rent",
    salary: "Salary",
    allowance: "Allowance",
    bonus: "Bonus",
    deduction: "Deduction",
    insurance_premium: "Insurance premium",
    deductible: "Deductible",
    coverage_limit: "Coverage limit",
    security_deposit: "Security deposit",
    brokerage_fee: "Brokerage fee",
    administrative_fee: "Administrative fee",
    annual_fee: "Annual fee",
    subscription_fee: "Subscription fee",
    down_payment: "Down payment",
    final_payment: "Final payment",
    financing_principal: "Financing principal",
    asset_value: "Asset value",
    total_repayment: "Total repayment",
    financing_cost: "Financing cost",
    credit_limit: "Credit limit",
    minimum_payment: "Minimum payment",
    late_fee: "Late fee",
    early_termination_fee: "Early termination fee",
    collection_cost: "Collection cost",
    maintenance_cost: "Maintenance cost",
    renewal_cost: "Renewal cost",
    refund: "Refund",
    tax: "Tax",
    processing_fee: "Processing fee",
    transfer_fee: "Transfer fee",
    registration_fee: "Registration fee",
    service_fee: "Service fee",
    early_settlement_fee: "Early settlement fee",
    cancellation_fee: "Cancellation fee",
    returned_payment_fee: "Returned payment fee",
    recurring_payment: "Recurring payment",
    one_time_payment: "One-time payment",
    conditional_payment: "Conditional payment",
    interest_rate: "Interest rate (APR)",
    outstanding_balance: "Outstanding balance",
    other: "Other",
  },
};

/** Returns the centralized, localized label for a canonical financial concept id — exhaustive over the closed enum, never a raw engine label or schema key. */
export function getCanonicalConceptLabel(conceptId: CanonicalConceptId, language: AnalysisLanguage): string {
  return CANONICAL_CONCEPT_LABELS[language][conceptId];
}
