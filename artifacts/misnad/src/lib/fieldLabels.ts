import type { AnalysisLanguage } from "@workspace/contract-types";

interface Label {
  ar: string;
  en: string;
}

/**
 * Labels for the generic, repeated-array-item fields shared across every
 * contract type (parties, financialObligations, dates, penalties, fees,
 * importantClauses, extractedNumbers). Keyed as "section.field".
 */
const GENERIC_FIELD_LABELS: Record<string, Label> = {
  "parties.role": { ar: "دور الطرف", en: "Party role" },
  "parties.name": { ar: "اسم الطرف", en: "Party name" },
  "parties.identifier": { ar: "معرف الطرف", en: "Party identifier" },
  "parties.notes": { ar: "ملاحظات على الطرف", en: "Party notes" },

  "financialObligations.description": { ar: "وصف الالتزام المالي", en: "Financial obligation description" },
  "financialObligations.amount": { ar: "مبلغ الالتزام المالي", en: "Financial obligation amount" },
  "financialObligations.currency": { ar: "عملة الالتزام المالي", en: "Financial obligation currency" },
  "financialObligations.frequency": { ar: "تكرار الالتزام المالي", en: "Financial obligation frequency" },
  "financialObligations.dueDate": { ar: "تاريخ استحقاق الالتزام المالي", en: "Financial obligation due date" },

  "dates.label": { ar: "عنوان التاريخ", en: "Date label" },
  "dates.date": { ar: "التاريخ", en: "Date" },
  "dates.notes": { ar: "ملاحظات على التاريخ", en: "Date notes" },

  "penalties.description": { ar: "وصف الغرامة", en: "Penalty description" },
  "penalties.amount": { ar: "مبلغ الغرامة", en: "Penalty amount" },
  "penalties.currency": { ar: "عملة الغرامة", en: "Penalty currency" },
  "penalties.condition": { ar: "شرط تطبيق الغرامة", en: "Penalty condition" },

  "fees.description": { ar: "وصف الرسوم", en: "Fee description" },
  "fees.amount": { ar: "مبلغ الرسوم", en: "Fee amount" },
  "fees.currency": { ar: "عملة الرسوم", en: "Fee currency" },
  "fees.isRecurring": { ar: "هل الرسوم متكررة", en: "Whether the fee is recurring" },

  "importantClauses.title": { ar: "عنوان البند", en: "Clause title" },
  "importantClauses.summary": { ar: "ملخص البند", en: "Clause summary" },
  "importantClauses.riskLevel": { ar: "مستوى الخطورة", en: "Risk level" },
  "importantClauses.evidence": { ar: "النص الداعم من العقد", en: "Supporting contract evidence" },

  "extractedNumbers.label": { ar: "عنوان الرقم المستخرج", en: "Extracted number label" },
  "extractedNumbers.value": { ar: "قيمة الرقم المستخرج", en: "Extracted number value" },
  "extractedNumbers.unit": { ar: "وحدة الرقم المستخرج", en: "Extracted number unit" },
};

/**
 * Labels for typeDetails.* fields, deduplicated by field name across all
 * nine contract-type variants (field names carry the same meaning
 * regardless of which contract type they appear under).
 */
const TYPE_DETAILS_FIELD_LABELS: Record<string, Label> = {
  vehicleMake: { ar: "ماركة المركبة", en: "Vehicle make" },
  vehicleModel: { ar: "موديل المركبة", en: "Vehicle model" },
  vehicleYear: { ar: "سنة صنع المركبة", en: "Vehicle year" },
  financedAmount: { ar: "مبلغ التمويل", en: "Financed amount" },
  downPayment: { ar: "الدفعة المقدمة", en: "Down payment" },
  interestRate: { ar: "نسبة الفائدة", en: "Interest rate" },
  loanTermMonths: { ar: "مدة التمويل (أشهر)", en: "Loan term (months)" },
  monthlyInstallment: { ar: "القسط الشهري", en: "Monthly installment" },
  balloonPayment: { ar: "الدفعة الختامية", en: "Balloon payment" },
  loanAmount: { ar: "مبلغ التمويل", en: "Loan amount" },
  purpose: { ar: "الغرض من التمويل", en: "Purpose" },
  earlySettlementTerms: { ar: "شروط السداد المبكر", en: "Early settlement terms" },
  propertyAddress: { ar: "عنوان العقار", en: "Property address" },
  propertyValue: { ar: "قيمة العقار", en: "Property value" },
  loanTermYears: { ar: "مدة التمويل (سنوات)", en: "Loan term (years)" },
  creditLimit: { ar: "الحد الائتماني", en: "Credit limit" },
  annualFee: { ar: "الرسوم السنوية", en: "Annual fee" },
  interestRateApr: { ar: "معدل الفائدة السنوي", en: "Annual interest rate (APR)" },
  minimumPaymentPercentage: { ar: "نسبة الحد الأدنى للسداد", en: "Minimum payment percentage" },
  lateFee: { ar: "رسوم التأخير", en: "Late fee" },
  cashAdvanceFee: { ar: "رسوم السحب النقدي", en: "Cash advance fee" },
  monthlyRent: { ar: "الإيجار الشهري", en: "Monthly rent" },
  securityDeposit: { ar: "مبلغ التأمين", en: "Security deposit" },
  leaseTermMonths: { ar: "مدة الإيجار (أشهر)", en: "Lease term (months)" },
  renewalTerms: { ar: "شروط التجديد", en: "Renewal terms" },
  utilitiesIncluded: { ar: "هل المرافق مشمولة", en: "Whether utilities are included" },
  insuranceType: { ar: "نوع التأمين", en: "Insurance type" },
  coverageAmount: { ar: "مبلغ التغطية التأمينية", en: "Coverage amount" },
  premiumAmount: { ar: "قيمة القسط التأميني", en: "Premium amount" },
  premiumFrequency: { ar: "تكرار القسط التأميني", en: "Premium frequency" },
  deductible: { ar: "مبلغ التحمل", en: "Deductible" },
  policyTermMonths: { ar: "مدة الوثيقة (أشهر)", en: "Policy term (months)" },
  exclusions: { ar: "الاستثناءات", en: "Exclusions" },
  jobTitle: { ar: "المسمى الوظيفي", en: "Job title" },
  employer: { ar: "جهة العمل", en: "Employer" },
  employmentType: { ar: "نوع التوظيف", en: "Employment type" },
  baseSalary: { ar: "الراتب الأساسي", en: "Base salary" },
  salaryFrequency: { ar: "تكرار صرف الراتب", en: "Salary frequency" },
  probationPeriodMonths: { ar: "مدة فترة التجربة (أشهر)", en: "Probation period (months)" },
  noticePeriodDays: { ar: "مدة الإشعار (أيام)", en: "Notice period (days)" },
  nonCompeteTerms: { ar: "شروط عدم المنافسة", en: "Non-compete terms" },
  serviceName: { ar: "اسم الخدمة", en: "Service name" },
  billingAmount: { ar: "مبلغ الفوترة", en: "Billing amount" },
  billingFrequency: { ar: "تكرار الفوترة", en: "Billing frequency" },
  autoRenew: { ar: "هل يتجدد تلقائياً", en: "Whether it auto-renews" },
  cancellationTerms: { ar: "شروط الإلغاء", en: "Cancellation terms" },
  freeTrialDays: { ar: "أيام الفترة التجريبية المجانية", en: "Free trial days" },
  description: { ar: "الوصف", en: "Description" },
};

/** Removes array indices (e.g. "[0]", "[12]") from a field path. */
function stripArrayIndexes(path: string): string {
  return path.replace(/\[\d+\]/g, "");
}

function humanizeSegment(segment: string): string {
  const spaced = segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) return segment;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Converts a raw internal field path (as found in `missingInformation[].field`,
 * possibly with array indexes) into a safe, human-readable localized label.
 * Never returns the raw path, brackets, or dots — callers must not display
 * `field` directly to the user.
 */
export function getFieldLabel(rawPath: string, language: AnalysisLanguage): string {
  const normalized = stripArrayIndexes(rawPath).replace(/^\.+|\.+$/g, "");
  const segments = normalized.split(".").filter(Boolean);

  if (segments.length === 0) {
    return language === "ar" ? "معلومة غير محددة" : "Unspecified information";
  }

  if (segments[0] === "typeDetails" && segments.length >= 2) {
    const fieldName = segments[segments.length - 1];
    const label = TYPE_DETAILS_FIELD_LABELS[fieldName];
    if (label) return label[language];
    return fallbackLabel(fieldName, language);
  }

  if (segments.length >= 2) {
    const key = `${segments[0]}.${segments[segments.length - 1]}`;
    const label = GENERIC_FIELD_LABELS[key];
    if (label) return label[language];
  }

  if (segments.length === 1) {
    const label = TYPE_DETAILS_FIELD_LABELS[segments[0]];
    if (label) return label[language];
  }

  return fallbackLabel(segments[segments.length - 1], language);
}

function fallbackLabel(fieldName: string, language: AnalysisLanguage): string {
  const humanized = humanizeSegment(fieldName);
  return language === "ar" ? `بيانات إضافية: ${humanized}` : `Additional detail: ${humanized}`;
}
