import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";

/**
 * Pure frontend convenience prompts shown before the first message — every
 * one of these is sent through the exact same `POST /api/contract-chat`
 * pipeline as a typed question (see `ContractChat.tsx`); nothing here
 * bypasses validation, routing, or grounding.
 */
const SUGGESTED_QUESTIONS: Record<ContractType, Record<AnalysisLanguage, string[]>> = {
  lease: {
    ar: ["هل يحق للمؤجر إخلائي عند التأخر في السداد؟", "ما رسوم التأخير الموجودة في العقد؟", "هل يتجدد العقد تلقائياً؟"],
    en: ["Can the landlord evict me if I'm late on payment?", "What late fees are in my contract?", "Does the contract renew automatically?"],
  },
  employment: {
    ar: ["ما مدة التجربة في عقدي؟", "ما شروط إنهاء العقد؟", "هل مدة الإشعار متوافقة مع النظام؟"],
    en: ["What is my probation period?", "What are the termination conditions?", "Is the notice period compliant with regulations?"],
  },
  auto_finance: {
    ar: ["كم سأدفع شهرياً؟", "ما التكلفة الإجمالية؟", "هل توجد غرامة للسداد المبكر؟"],
    en: ["How much will I pay every month?", "What is the total cost?", "Is there an early settlement penalty?"],
  },
  personal_finance: {
    ar: ["كم سأدفع شهرياً؟", "ما إجمالي تكلفة التمويل؟", "هل توجد غرامة للسداد المبكر؟"],
    en: ["How much will I pay every month?", "What is the total cost of this financing?", "Is there an early settlement penalty?"],
  },
  mortgage: {
    ar: ["كم القسط الشهري لهذا التمويل العقاري؟", "ما إجمالي المبلغ الذي سأسدده؟", "هل يوجد شرط سداد مبكر؟"],
    en: ["What is my monthly mortgage payment?", "What is the total amount I will repay?", "Is there an early repayment condition?"],
  },
  credit_card: {
    ar: ["ما هو الحد الأدنى للسداد الشهري؟", "ما رسوم التأخير في السداد؟", "ما معدل الفائدة السنوي؟"],
    en: ["What is the minimum monthly payment?", "What are the late payment fees?", "What is the annual interest rate?"],
  },
  insurance: {
    ar: ["متى يحق لشركة التأمين رفض المطالبة؟", "هل يمكنني إلغاء الوثيقة واسترداد المبلغ؟", "ما مدة فترة المراجعة (Free Look)؟"],
    en: ["When can the insurer deny or reject a claim?", "Can I cancel the policy and get a refund?", "What is the free-look period?"],
  },
  subscription: {
    ar: ["هل يتجدد الاشتراك تلقائياً؟", "كيف يمكنني إلغاء الاشتراك؟", "هل توجد رسوم إلغاء؟"],
    en: ["Does the subscription renew automatically?", "How do I cancel the subscription?", "Are there cancellation fees?"],
  },
  other: {
    ar: ["ما أهم الالتزامات المذكورة في هذا العقد؟", "هل توجد شروط جزائية في العقد؟", "ما مدة العقد؟"],
    en: ["What are the main obligations in this contract?", "Are there any penalty clauses?", "What is the contract's duration?"],
  },
};

export function getSuggestedQuestions(contractType: ContractType, language: AnalysisLanguage): string[] {
  return SUGGESTED_QUESTIONS[contractType][language];
}
